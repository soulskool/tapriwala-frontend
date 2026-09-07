import { createApi } from '@reduxjs/toolkit/query/react';

import { API_BASE_URL } from '@/lib/api-config';
import type { ExportMethod, ExportStatus } from '@/lib/constants';
import type {
  BillingExport,
  BillingQueueEntry,
  ConsolidatedBill,
  ExportResult,
  Paginated,
} from '@/lib/types';
import { baseQuery, unwrap, unwrapPaginated } from './base-query';

/**
 * The counter screen.
 *
 * The whole point of this API is that nobody retypes an order. `consolidate`
 * merges every round by productCode and is read-only, so staff can open it as
 * often as they like while the table is still ordering.
 */
export const billingApi = createApi({
  reducerPath: 'billingApi',
  baseQuery,
  refetchOnReconnect: true,
  tagTypes: ['BillingQueue', 'Bill', 'Export'],
  endpoints: (builder) => ({
    queue: builder.query<{ sessions: BillingQueueEntry[]; count: number }, void>({
      query: () => '/billing/queue',
      transformResponse: unwrap<{ sessions: BillingQueueEntry[]; count: number }>,
      providesTags: ['BillingQueue'],
    }),

    consolidate: builder.query<ConsolidatedBill, string>({
      query: (sessionId) => `/billing/${sessionId}/consolidate`,
      transformResponse: unwrap<ConsolidatedBill>,
      providesTags: (_result, _error, sessionId) => [{ type: 'Bill', id: sessionId }],
    }),

    /**
     * Freeze the bill and hand it to the POS.
     *
     * A failed hand-off comes back as a normal 201 with
     * `exportStatus: 'failed'` — never as an HTTP error — because staff must
     * still be able to print and take payment while the POS link is down.
     */
    exportBill: builder.mutation<
      ExportResult,
      { sessionId: string; method?: ExportMethod; note?: string }
    >({
      query: ({ sessionId, ...body }) => ({
        url: `/billing/${sessionId}/export`,
        method: 'POST',
        body,
      }),
      transformResponse: unwrap<ExportResult>,
      invalidatesTags: (_result, _error, { sessionId }) => [
        { type: 'Bill', id: sessionId },
        'BillingQueue',
        'Export',
      ],
    }),

    retryExport: builder.mutation<BillingExport, { id: string; method?: ExportMethod }>({
      query: ({ id, method }) => ({
        url: `/billing/exports/${id}/retry`,
        method: 'POST',
        body: method ? { method } : {},
      }),
      transformResponse: unwrap<BillingExport>,
      invalidatesTags: ['Export'],
    }),

    /** Record the legacy POS's own invoice number against our bill. */
    confirmExport: builder.mutation<
      BillingExport,
      {
        id: string;
        exportStatus: ExportStatus;
        posReferenceId?: string;
        error?: string;
        note?: string;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/billing/exports/${id}`, method: 'PATCH', body }),
      transformResponse: unwrap<BillingExport>,
      invalidatesTags: ['Export', 'BillingQueue'],
    }),

    listExports: builder.query<
      Paginated<BillingExport>,
      {
        status?: ExportStatus;
        sessionId?: string;
        /** Narrows the history to one table, e.g. "M2". */
        tableCode?: string;
        /** true = paid only, false = everything not paid. Omit for both. */
        settled?: boolean;
        page?: number;
        limit?: number;
      } | void
    >({
      query: (params) => ({ url: '/billing/exports', params: params ?? undefined }),
      transformResponse: unwrapPaginated<BillingExport>,
      providesTags: ['Export'],
    }),

    getExport: builder.query<BillingExport, string>({
      query: (id) => `/billing/exports/${id}`,
      transformResponse: unwrap<BillingExport>,
      providesTags: ['Export'],
    }),
  }),
});

/**
 * Downloads the consolidated bill as a CSV.
 *
 * Outside RTK Query on purpose: the response is a file, not JSON, and the
 * browser needs a real object URL to save it. `credentials: 'include'` sends
 * the same session cookie the rest of the screen uses, so the download honours
 * exactly the same permissions.
 */
export interface BillsXlsxFilter {
  /** ISO date, inclusive. */
  from?: string;
  /** ISO date, inclusive. */
  to?: string;
  /** true = paid only, false = unsettled only, undefined = every bill. */
  settled?: boolean;
  tableCode?: string;
}

/**
 * Downloads the bill history as an Excel workbook.
 *
 * Outside RTK Query for the same reason `downloadBillCsv` is: the response is
 * a file, and caching a binary blob in the store would be pure waste. The
 * server does the filtering and writes the sheet — the browser never holds the
 * whole history in memory, and a phone on café Wi-Fi downloads one file rather
 * than paging through the lot.
 */
export async function downloadBillsXlsx(filter: BillsXlsxFilter, filename: string): Promise<void> {
  const params = new URLSearchParams();
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.tableCode) params.set('tableCode', filter.tableCode);
  // Only sent when a side was chosen — absent means "every bill".
  if (filter.settled !== undefined) params.set('settled', String(filter.settled));

  const response = await fetch(`${API_BASE_URL}/billing/exports/xlsx?${params.toString()}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    // The server answers errors as the usual JSON envelope, so surface its
    // message rather than a generic one — a 403 here means the wrong role.
    let message = 'Could not download the spreadsheet';
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      /* a non-JSON failure keeps the default message */
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadBillCsv(sessionId: string, filename: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/billing/${sessionId}/csv`, {
    credentials: 'include',
  });

  if (!response.ok) throw new Error('Could not download the CSV');

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const {
  useQueueQuery: useBillingQueueQuery,
  useConsolidateQuery,
  useExportBillMutation,
  useRetryExportMutation,
  useConfirmExportMutation,
  useListExportsQuery,
  useGetExportQuery,
} = billingApi;
