import { createApi } from '@reduxjs/toolkit/query/react';

import type { ItemStatus, OrderType } from '@/lib/constants';
import type {
  OrderItemInput,
  OrderRound,
  Paginated,
  PlacedOrder,
  SessionDetail,
  TableSession,
} from '@/lib/types';
import { baseQuery, unwrap, unwrapPaginated } from './base-query';

/**
 * Sessions and the order rounds inside them — the waiter's half of the system.
 *
 * A session is one continuous occupancy. Every "Place Order" tap appends a
 * round to the same session, which is the whole fix for the add-on problem:
 * M2 has one bill, not three.
 */
export const sessionApi = createApi({
  reducerPath: 'sessionApi',
  baseQuery,
  tagTypes: ['Session', 'SessionList'],
  endpoints: (builder) => ({
    sessionDetail: builder.query<SessionDetail, string>({
      query: (id) => `/sessions/${id}`,
      transformResponse: unwrap<SessionDetail>,
      // Also tagged with every table whose bill was moved here, so a Ready
      // from the kitchen or a Served tap on M3 refreshes L5's "From M3" too.
      providesTags: (result, _error, id) => [
        { type: 'Session', id },
        ...(result?.billIncludes ?? []).map((included) => ({
          type: 'Session' as const,
          id: included.sessionId,
        })),
      ],
    }),

    listSessions: builder.query<
      Paginated<TableSession>,
      {
        status?: string;
        tableId?: string;
        activeOnly?: boolean;
        page?: number;
        limit?: number;
      } | void
    >({
      query: (params) => ({ url: '/sessions', params: params ?? undefined }),
      transformResponse: unwrapPaginated<TableSession>,
      providesTags: ['SessionList'],
    }),

    sessionRounds: builder.query<OrderRound[], string>({
      query: (id) => `/sessions/${id}/rounds`,
      transformResponse: unwrap<OrderRound[]>,
      providesTags: (_result, _error, id) => [{ type: 'Session', id }],
    }),

    /**
     * Opens a table, or returns the session already on it.
     *
     * Never treat a 200 here as "I created this" — two waiters tapping M2 at
     * once both land in the *same* session by design.
     */
    openSession: builder.mutation<TableSession, { tableId: string; guestCount?: number }>({
      query: (body) => ({ url: '/sessions', method: 'POST', body }),
      transformResponse: unwrap<TableSession>,
      invalidatesTags: ['SessionList'],
    }),

    /**
     * Place an order round.
     *
     * `idempotencyKey` is required by the caller, not optional: a double-tapped
     * button or a retry after dropped Wi-Fi must return the original round
     * rather than send a second ticket to the kitchen.
     *
     * `orderType` is required for the same class of reason, one step earlier:
     * left optional it would be forgotten at a call site and the round would
     * quietly default to dining, which is a parcel handed to a table.
     */
    placeRound: builder.mutation<
      PlacedOrder,
      {
        sessionId: string;
        items: OrderItemInput[];
        orderType: OrderType;
        idempotencyKey: string;
      }
    >({
      query: ({ sessionId, ...body }) => ({
        url: `/sessions/${sessionId}/rounds`,
        method: 'POST',
        body,
      }),
      transformResponse: unwrap<PlacedOrder>,
      invalidatesTags: (_result, _error, { sessionId }) => [
        { type: 'Session', id: sessionId },
        'SessionList',
      ],
    }),

    /**
     * Item-level status — the KDS's main write, and the waiter's "Served" tap.
     *
     * Optimistic: a cook tapping Ready on a mounted tablet should see the tile
     * flip in the same frame. If the server refuses the transition, the patch
     * rolls back and the socket broadcast restores the truth.
     */
    updateItemStatus: builder.mutation<
      OrderRound,
      {
        roundId: string;
        itemId: string;
        status: ItemStatus;
        reason?: string;
        sessionId?: string;
        /**
         * The paying table's session, when the tap is on another table's round
         * shown on its screen ("From M3" on L5) — patched too, so the tap
         * shows at once there rather than after the refetch.
         */
        payerSessionId?: string;
      }
    >({
      query: ({ roundId, itemId, status, reason }) => ({
        url: `/rounds/${roundId}/items/${itemId}`,
        method: 'PATCH',
        body: { status, ...(reason ? { reason } : {}) },
      }),
      transformResponse: unwrap<OrderRound>,
      async onQueryStarted(
        { roundId, itemId, status, sessionId, payerSessionId },
        { dispatch, queryFulfilled },
      ) {
        if (!sessionId) {
          await queryFulfilled.catch(() => undefined);
          return;
        }
        const setStatus = (rounds: OrderRound[]) => {
          const item = rounds
            .find((round) => round._id === roundId)
            ?.items.find((line) => line._id === itemId);
          if (item) item.status = status;
        };
        const patches = [
          dispatch(
            sessionApi.util.updateQueryData('sessionDetail', sessionId, (draft) =>
              setStatus(draft.rounds),
            ),
          ),
        ];
        if (payerSessionId && payerSessionId !== sessionId) {
          patches.push(
            dispatch(
              sessionApi.util.updateQueryData('sessionDetail', payerSessionId, (draft) => {
                for (const included of draft.billIncludes) setStatus(included.rounds);
              }),
            ),
          );
        }
        try {
          await queryFulfilled;
        } catch {
          for (const patch of patches) patch.undo();
        }
      },
      invalidatesTags: (_result, _error, { sessionId }) =>
        sessionId ? [{ type: 'Session', id: sessionId }] : [],
    }),

    /** "All ready" / "all served" on a whole ticket. */
    updateRoundStatus: builder.mutation<
      OrderRound,
      { roundId: string; status: ItemStatus; reason?: string; sessionId?: string }
    >({
      query: ({ roundId, status, reason }) => ({
        url: `/rounds/${roundId}/status`,
        method: 'PATCH',
        body: { status, ...(reason ? { reason } : {}) },
      }),
      transformResponse: unwrap<OrderRound>,
      invalidatesTags: (_result, _error, { sessionId }) =>
        sessionId ? [{ type: 'Session', id: sessionId }, 'SessionList'] : ['SessionList'],
    }),

    /** Billing closes the session — this is what frees the table on the grid. */
    closeSession: builder.mutation<
      TableSession,
      { sessionId: string; billingExportId?: string; note?: string; force?: boolean }
    >({
      query: ({ sessionId, ...body }) => ({
        url: `/sessions/${sessionId}/close`,
        method: 'POST',
        body,
      }),
      transformResponse: unwrap<TableSession>,
      invalidatesTags: (_result, _error, { sessionId }) => [
        { type: 'Session', id: sessionId },
        'SessionList',
      ],
    }),

    /** Waiter opened the wrong table. Needs a reason; always audit-logged. */
    transferSession: builder.mutation<
      TableSession,
      { sessionId: string; toTableId: string; reason: string }
    >({
      query: ({ sessionId, ...body }) => ({
        url: `/sessions/${sessionId}/transfer`,
        method: 'POST',
        body,
      }),
      transformResponse: unwrap<TableSession>,
      invalidatesTags: (_result, _error, { sessionId }) => [
        { type: 'Session', id: sessionId },
        'SessionList',
      ],
    }),

    /**
     * Two tables, one bill: this table's bill goes on `toTableId`'s. The
     * kitchen still cooks for this table; only who pays changes.
     */
    moveBill: builder.mutation<
      TableSession,
      { sessionId: string; toTableId: string; reason?: string }
    >({
      query: ({ sessionId, ...body }) => ({
        url: `/sessions/${sessionId}/move-bill`,
        method: 'POST',
        body,
      }),
      transformResponse: unwrap<TableSession>,
      // Every session's detail can change (the payer gains a rider), so all of them.
      invalidatesTags: ['Session', 'SessionList'],
    }),

    /** The table gets its own bill back. Refused once the paying bill is generated. */
    undoBillMove: builder.mutation<TableSession, { sessionId: string }>({
      query: ({ sessionId }) => ({
        url: `/sessions/${sessionId}/undo-bill-move`,
        method: 'POST',
        body: {},
      }),
      transformResponse: unwrap<TableSession>,
      invalidatesTags: ['Session', 'SessionList'],
    }),

    /** Hold / release a session for manager review after a late cancellation. */
    setSessionReview: builder.mutation<
      TableSession,
      { sessionId: string; heldForReview: boolean; note?: string }
    >({
      query: ({ sessionId, ...body }) => ({
        url: `/sessions/${sessionId}/review`,
        method: 'PATCH',
        body,
      }),
      transformResponse: unwrap<TableSession>,
      invalidatesTags: (_result, _error, { sessionId }) => [
        { type: 'Session', id: sessionId },
        'SessionList',
      ],
    }),
  }),
});

export const {
  useSessionDetailQuery,
  useListSessionsQuery,
  useSessionRoundsQuery,
  useOpenSessionMutation,
  usePlaceRoundMutation,
  useUpdateItemStatusMutation,
  useUpdateRoundStatusMutation,
  useCloseSessionMutation,
  useTransferSessionMutation,
  useMoveBillMutation,
  useUndoBillMoveMutation,
  useSetSessionReviewMutation,
} = sessionApi;
