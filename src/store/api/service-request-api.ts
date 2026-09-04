import { createApi } from '@reduxjs/toolkit/query/react';

import type { ServiceRequestStatus, ServiceRequestType } from '@/lib/constants';
import type { Paginated, ServiceRequest, ServiceRequestQueue } from '@/lib/types';
import { baseQuery, unwrap, unwrapPaginated } from './base-query';

/**
 * Water / call staff / bill requests — the waiter dashboard's live feed.
 *
 * This is the veranda-and-lawn fix: a guest out of eyeshot raises a request
 * from their own phone, and it appears here with a wait time that keeps
 * climbing until someone deals with it.
 */
export const serviceRequestApi = createApi({
  reducerPath: 'serviceRequestApi',
  baseQuery,
  refetchOnReconnect: true,
  tagTypes: ['Queue', 'RequestList'],
  endpoints: (builder) => ({
    /** Oldest first, with `isEscalated` already computed by the server. */
    queue: builder.query<ServiceRequestQueue, void>({
      query: () => '/service-requests/queue',
      transformResponse: unwrap<ServiceRequestQueue>,
      providesTags: ['Queue'],
    }),

    listRequests: builder.query<
      Paginated<ServiceRequest>,
      {
        status?: ServiceRequestStatus;
        type?: ServiceRequestType;
        tableId?: string;
        sessionId?: string;
        openOnly?: boolean;
        page?: number;
        limit?: number;
      } | void
    >({
      query: (params) => ({ url: '/service-requests', params: params ?? undefined }),
      transformResponse: unwrapPaginated<ServiceRequest>,
      providesTags: ['RequestList'],
    }),

    /** Staff raising a request for a guest who asked verbally or by phone. */
    raiseRequest: builder.mutation<
      ServiceRequest,
      { tableId: string; type: ServiceRequestType; note?: string }
    >({
      query: (body) => ({ url: '/service-requests', method: 'POST', body }),
      transformResponse: unwrap<ServiceRequest>,
      invalidatesTags: ['Queue', 'RequestList'],
    }),

    /**
     * Acknowledge / resolve / dismiss.
     *
     * Optimistic, because acknowledging is what stops another waiter walking
     * to the same table — the feedback has to be instant to be useful.
     */
    updateRequest: builder.mutation<
      ServiceRequest,
      { id: string; status: ServiceRequestStatus; note?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/service-requests/${id}`, method: 'PATCH', body }),
      transformResponse: unwrap<ServiceRequest>,
      async onQueryStarted({ id, status }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          serviceRequestApi.util.updateQueryData('queue', undefined, (draft) => {
            if (status === 'resolved' || status === 'cancelled') {
              draft.requests = draft.requests.filter(
                (request) => (request.requestId ?? request._id) !== id,
              );
              draft.count = draft.requests.length;
              return;
            }
            const target = draft.requests.find(
              (request) => (request.requestId ?? request._id) === id,
            );
            if (target) target.status = status;
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ['Queue', 'RequestList'],
    }),
  }),
});

export const {
  useQueueQuery: useServiceRequestQueueQuery,
  useListRequestsQuery,
  useRaiseRequestMutation,
  useUpdateRequestMutation,
} = serviceRequestApi;
