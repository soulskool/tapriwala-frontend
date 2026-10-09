import { createApi } from '@reduxjs/toolkit/query/react';

import type { Role } from '@/lib/constants';
import type {
  AdminOverview,
  AuditEntry,
  DailySalesReport,
  Paginated,
  StaffUser,
} from '@/lib/types';
import { baseQuery, unwrap, unwrapPaginated } from './base-query';

/**
 * Ownership's read-only view of the floor, plus users and the audit trail.
 *
 * `overview` exists so nobody has to walk the floor or interrupt staff
 * mid-service to find out what is happening.
 */
export const adminApi = createApi({
  reducerPath: 'adminApi',
  baseQuery,
  refetchOnReconnect: true,
  tagTypes: ['Overview', 'User', 'Audit'],
  endpoints: (builder) => ({
    overview: builder.query<AdminOverview, void>({
      query: () => '/admin/overview',
      transformResponse: unwrap<AdminOverview>,
      providesTags: ['Overview'],
    }),

    listUsers: builder.query<StaffUser[], { includeInactive?: boolean } | void>({
      query: (params) => ({ url: '/admin/users', params: params ?? undefined }),
      transformResponse: unwrap<StaffUser[]>,
      providesTags: ['User'],
    }),

    createUser: builder.mutation<
      StaffUser,
      { name: string; phone: string; role: Role; pin: string }
    >({
      query: (body) => ({ url: '/admin/users', method: 'POST', body }),
      transformResponse: unwrap<StaffUser>,
      invalidatesTags: ['User'],
    }),

    updateUser: builder.mutation<
      StaffUser,
      { id: string; body: Partial<{ name: string; role: Role; pin: string; isActive: boolean }> }
    >({
      query: ({ id, body }) => ({ url: `/admin/users/${id}`, method: 'PATCH', body }),
      transformResponse: unwrap<StaffUser>,
      invalidatesTags: ['User'],
    }),

    /** The scrutiny trail — the answer to "the guest says they never ordered that". */
    listAudit: builder.query<
      Paginated<AuditEntry>,
      {
        entityType?: string;
        entityId?: string;
        sessionId?: string;
        tableCode?: string;
        action?: string;
        from?: string;
        to?: string;
        page?: number;
        limit?: number;
      } | void
    >({
      query: (params) => ({ url: '/admin/audit', params: params ?? undefined }),
      transformResponse: unwrapPaginated<AuditEntry>,
      providesTags: ['Audit'],
    }),

    /**
     * What each day took, from paid bills only. Both dates are `YYYY-MM-DD`
     * café days; leaving them out means the last 30 days.
     *
     * Refetched on every visit rather than kept live over the socket: this is
     * read at the end of a shift, not watched during one.
     */
    dailySales: builder.query<DailySalesReport, { from?: string; to?: string } | void>({
      query: (params) => ({ url: '/admin/sales/daily', params: params ?? undefined }),
      transformResponse: unwrap<DailySalesReport>,
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useOverviewQuery,
  useListUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useListAuditQuery,
  useDailySalesQuery,
} = adminApi;
