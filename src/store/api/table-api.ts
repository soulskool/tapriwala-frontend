import { createApi } from '@reduxjs/toolkit/query/react';

import type { LiveGridResponse, TableMaster, Zone } from '@/lib/types';
import { baseQuery, unwrap } from './base-query';

/** A table row plus the URL that goes into its printed QR sticker. */
export interface TableWithQr extends TableMaster {
  qrUrl: string;
}

/**
 * The live table screen (Requirement 1), the Table Master behind it, and the
 * zones the floor is drawn in.
 *
 * The grid is deliberately *not* polled. Sockets push every change that can
 * move a tile, and `socket-middleware` invalidates the `LiveGrid` tag; polling
 * on top of that would just add load without adding freshness.
 */
export const tableApi = createApi({
  reducerPath: 'tableApi',
  baseQuery,
  tagTypes: ['LiveGrid', 'TableMaster', 'Zone'],
  endpoints: (builder) => ({
    liveGrid: builder.query<LiveGridResponse, void>({
      query: () => '/tables',
      transformResponse: unwrap<LiveGridResponse>,
      providesTags: ['LiveGrid'],
    }),

    listTables: builder.query<TableMaster[], { includeInactive?: boolean } | void>({
      query: (params) => ({ url: '/tables/master', params: params ?? undefined }),
      transformResponse: unwrap<TableMaster[]>,
      providesTags: ['TableMaster'],
    }),

    getTable: builder.query<TableWithQr, string>({
      query: (id) => `/tables/${id}`,
      transformResponse: unwrap<TableWithQr>,
      providesTags: ['TableMaster'],
    }),

    createTable: builder.mutation<TableWithQr, Partial<TableMaster>>({
      query: (body) => ({ url: '/tables', method: 'POST', body }),
      transformResponse: unwrap<TableWithQr>,
      invalidatesTags: ['TableMaster', 'LiveGrid', 'Zone'],
    }),

    updateTable: builder.mutation<TableMaster, { id: string; body: Partial<TableMaster> }>({
      query: ({ id, body }) => ({ url: `/tables/${id}`, method: 'PATCH', body }),
      transformResponse: unwrap<TableMaster>,
      invalidatesTags: ['TableMaster', 'LiveGrid', 'Zone'],
    }),

    /** Soft delete. Refused (409) while the table has an open session or request. */
    deleteTable: builder.mutation<{ _id: string; code: string }, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/tables/${id}`, method: 'DELETE', body: { reason } }),
      transformResponse: unwrap<{ _id: string; code: string }>,
      invalidatesTags: ['TableMaster', 'LiveGrid', 'Zone'],
    }),

    listZones: builder.query<Zone[], void>({
      query: () => '/zones',
      transformResponse: unwrap<Zone[]>,
      providesTags: ['Zone'],
    }),

    createZone: builder.mutation<Zone, { name: string; displayOrder?: number }>({
      query: (body) => ({ url: '/zones', method: 'POST', body }),
      transformResponse: unwrap<Zone>,
      invalidatesTags: ['Zone'],
    }),

    /** A rename shows on every table at once: tables hold the zone's id. */
    updateZone: builder.mutation<
      Zone,
      { id: string; body: Partial<{ name: string; displayOrder: number }> }
    >({
      query: ({ id, body }) => ({ url: `/zones/${id}`, method: 'PATCH', body }),
      transformResponse: unwrap<Zone>,
      invalidatesTags: ['Zone', 'TableMaster', 'LiveGrid'],
    }),

    /** Refused (422) while any table is still in the zone. */
    deleteZone: builder.mutation<Zone, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/zones/${id}`, method: 'DELETE', body: { reason } }),
      transformResponse: unwrap<Zone>,
      invalidatesTags: ['Zone'],
    }),

    /**
     * Every active table's QR URL, for printing a sheet of stickers.
     *
     * Each URL is just `/order/<code>`, so a lost sticker is reprinted from
     * this same sheet — there is nothing to reissue.
     */
    qrSheet: builder.query<{ code: string; zone: string; qrUrl: string }[], void>({
      query: () => '/tables/qr-sheet',
      transformResponse: unwrap<{ code: string; zone: string; qrUrl: string }[]>,
      providesTags: ['TableMaster'],
    }),
  }),
});

export const {
  useLiveGridQuery,
  useListTablesQuery,
  useGetTableQuery,
  useCreateTableMutation,
  useUpdateTableMutation,
  useDeleteTableMutation,
  useListZonesQuery,
  useCreateZoneMutation,
  useUpdateZoneMutation,
  useDeleteZoneMutation,
  useQrSheetQuery,
} = tableApi;
