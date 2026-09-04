import { createApi } from '@reduxjs/toolkit/query/react';

import type { ServiceRequestType } from '@/lib/constants';
import type {
  CustomerOrderStatus,
  MenuCategory,
  OrderItemInput,
  PlacedOrder,
  ResolvedTable,
  ServiceRequest,
} from '@/lib/types';
import { baseQuery, unwrap } from './base-query';

/**
 * The customer QR flow. No login anywhere in this file.
 *
 * The table code in the URL is what the server pins every one of these
 * requests to before the handler runs, so a guest at M2 can only ever read and
 * write M2. It is a path segment on every endpoint rather than app-level state
 * precisely so there is no "current table" to get out of sync.
 */
export const customerApi = createApi({
  reducerPath: 'customerApi',
  baseQuery,
  refetchOnReconnect: true,
  tagTypes: ['Table', 'Menu', 'OrderStatus'],
  endpoints: (builder) => ({
    /** Landing screen: which table this is, and whether an order is running. */
    resolveTable: builder.query<ResolvedTable, string>({
      query: (tableCode) => `/public/tables/${tableCode}`,
      transformResponse: unwrap<ResolvedTable>,
      providesTags: ['Table'],
    }),

    /** Available items only — 86'd dishes never reach a guest's phone. */
    menu: builder.query<MenuCategory[], string>({
      query: (tableCode) => `/public/tables/${tableCode}/menu`,
      transformResponse: (response: { data: { categories: MenuCategory[] } }) =>
        response.data.categories,
      providesTags: ['Menu'],
    }),

    /** Live per-round status. Sockets push changes; this is the on-load truth. */
    orderStatus: builder.query<CustomerOrderStatus, string>({
      query: (tableCode) => `/public/tables/${tableCode}/order-status`,
      transformResponse: unwrap<CustomerOrderStatus>,
      providesTags: ['OrderStatus', 'Table'],
    }),

    /**
     * Place an order round.
     *
     * The client sends product codes and quantities only — price, tax and POS
     * name are read server-side, so a tampered request cannot order a ₹500
     * item for ₹5.
     */
    placeOrder: builder.mutation<
      PlacedOrder,
      { tableCode: string; items: OrderItemInput[]; idempotencyKey: string }
    >({
      query: ({ tableCode, ...body }) => ({
        url: `/public/tables/${tableCode}/orders`,
        method: 'POST',
        body,
      }),
      transformResponse: unwrap<PlacedOrder>,
      invalidatesTags: ['OrderStatus', 'Table'],
    }),

    /** Water / call staff / bill. Repeat taps bump the same request. */
    raiseServiceRequest: builder.mutation<
      ServiceRequest,
      { tableCode: string; type: ServiceRequestType; note?: string }
    >({
      query: ({ tableCode, ...body }) => ({
        url: `/public/tables/${tableCode}/service-requests`,
        method: 'POST',
        body,
      }),
      transformResponse: unwrap<ServiceRequest>,
      invalidatesTags: ['Table', 'OrderStatus'],
    }),
  }),
});

export const {
  useResolveTableQuery,
  useMenuQuery,
  useOrderStatusQuery,
  usePlaceOrderMutation,
  useRaiseServiceRequestMutation,
} = customerApi;
