import { createApi } from '@reduxjs/toolkit/query/react';

import type { TableZone } from '@/lib/constants';
import type { LiveGridResponse, TableMaster } from '@/lib/types';
import { baseQuery, unwrap } from './base-query';

/** A table row plus the URL that goes into its printed QR sticker. */
export interface TableWithQr extends TableMaster {
  qrUrl: string;
}

/**
 * The live table screen (Requirement 1) and the Table Master behind it.
 *
 * The grid is deliberately *not* polled. Sockets push every change that can
 * move a tile, and `socket-middleware` invalidates the `LiveGrid` tag; polling
 * on top of that would just add load without adding freshness.
 */
export const tableApi = createApi({
  reducerPath: 'tableApi',
  baseQuery,
  tagTypes: ['LiveGrid', 'TableMaster'],
  endpoints: (builder) => ({
    liveGrid: builder.query<LiveGridResponse, { zone?: TableZone } | void>({
      query: (params) => ({ url: '/tables', params: params ?? undefined }),
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
      invalidatesTags: ['TableMaster', 'LiveGrid'],
    }),

    updateTable: builder.mutation<TableMaster, { id: string; body: Partial<TableMaster> }>({
      query: ({ id, body }) => ({ url: `/tables/${id}`, method: 'PATCH', body }),
      transformResponse: unwrap<TableMaster>,
      invalidatesTags: ['TableMaster', 'LiveGrid'],
    }),

    /**
     * Every active table's QR URL, for printing a sheet of stickers.
     *
     * Each URL is just `/order/<code>`, so a lost sticker is reprinted from
     * this same sheet — there is nothing to reissue.
     */
    qrSheet: builder.query<{ code: string; zone: TableZone; qrUrl: string }[], void>({
      query: () => '/tables/qr-sheet',
      transformResponse: unwrap<{ code: string; zone: TableZone; qrUrl: string }[]>,
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
  useQrSheetQuery,
} = tableApi;
