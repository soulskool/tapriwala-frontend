import { createApi } from '@reduxjs/toolkit/query/react';

import type { KitchenStation } from '@/lib/constants';
import type { KitchenQueueResponse, OrderRound } from '@/lib/types';
import { baseQuery, unwrap } from './base-query';

/**
 * The kitchen display queue.
 *
 * `refetchOnReconnect` and `refetchOnFocus` are on deliberately. A mounted
 * tablet that dropped off the café Wi-Fi for two minutes must re-fetch the
 * whole queue rather than replay missed socket events — sockets notify, REST
 * tells the truth, and a lost ticket is a lost sale.
 */
export const kitchenApi = createApi({
  reducerPath: 'kitchenApi',
  baseQuery,
  refetchOnReconnect: true,
  refetchOnFocus: true,
  tagTypes: ['Queue', 'Ready'],
  endpoints: (builder) => ({
    queue: builder.query<
      KitchenQueueResponse,
      { station?: KitchenStation; includeServed?: boolean; sinceMinutes?: number } | void
    >({
      query: (params) => ({ url: '/kitchen/queue', params: params ?? undefined }),
      transformResponse: unwrap<KitchenQueueResponse>,
      providesTags: ['Queue'],
    }),

    /** Food sitting ready under the pass — the nudge on the waiter dashboard. */
    unservedReady: builder.query<
      { rounds: OrderRound[]; count: number },
      { thresholdMinutes?: number } | void
    >({
      query: (params) => ({ url: '/kitchen/ready', params: params ?? undefined }),
      transformResponse: unwrap<{ rounds: OrderRound[]; count: number }>,
      providesTags: ['Ready'],
    }),
  }),
});

export const { useQueueQuery, useUnservedReadyQuery } = kitchenApi;
