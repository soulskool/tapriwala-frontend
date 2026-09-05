'use client';

import { useMemo, useState } from 'react';

import { BillingNowPanel } from '@/components/kitchen/billing-now-panel';
import { KotTicketCard } from '@/components/kitchen/kot-ticket-card';
import { ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { useNewTicketChime } from '@/hooks/use-new-ticket-chime';
import {
  ITEM_STATUS,
  KITCHEN_STATION_VALUES,
  type ItemStatus,
  type KitchenStation,
} from '@/lib/constants';
import type { KdsTicket, KdsTicketItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { apiErrorMessage } from '@/store/api/base-query';
import { useQueueQuery } from '@/store/api/kitchen-api';
import { useUpdateItemStatusMutation, useUpdateRoundStatusMutation } from '@/store/api/session-api';
import { useLiveGridQuery } from '@/store/api/table-api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  kitchenSoundToggled,
  kitchenStationFilterChanged,
  toastPushed,
} from '@/store/slices/ui-slice';

/**
 * The live ticket board.
 *
 * The queue is fetched unfiltered and the station filter is applied here, in
 * the browser. That keeps one cache entry for the socket middleware to patch,
 * and makes switching station instant rather than a round-trip — which matters
 * on a mounted tablet a cook taps with the back of a knuckle.
 *
 * The board renders in the same light palette as the rest of the portal. It ran
 * dark until now, which read well across a bright kitchen but made /kitchen the
 * one screen that looked like a different product — and the sign-out and header
 * live in `RoleHeader` above it, so this file is only the board.
 */
export function KdsBoardClient() {
  const dispatch = useAppDispatch();
  const station = useAppSelector((state) => state.ui.kitchenStationFilter);
  const soundEnabled = useAppSelector((state) => state.ui.kitchenSoundEnabled);

  const queue = useQueueQuery();
  // Called with no argument, like every other live list, so the socket
  // middleware has exactly one `LiveGrid` cache entry to invalidate — the
  // waiter floor and this board share it.
  const grid = useLiveGridQuery();
  const [updateItemStatus] = useUpdateItemStatusMutation();
  const [updateRoundStatus] = useUpdateRoundStatusMutation();
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const tickets = useMemo(() => queue.data?.tickets ?? [], [queue.data]);

  useNewTicketChime(tickets, soundEnabled);

  const visible = useMemo(() => {
    if (station === 'all') return tickets;
    // A ticket stays on a station's board while it still has work for that
    // station, so a mixed round appears on both without being duplicated work.
    return tickets
      .map((ticket) => ({
        ...ticket,
        items: ticket.items.filter((item) => item.kitchenStation === station),
      }))
      .filter((ticket) => ticket.items.length > 0);
  }, [tickets, station]);

  async function handleItemStatus(ticket: KdsTicket, item: KdsTicketItem, status: ItemStatus) {
    setBusyItemId(item.itemId);
    try {
      await updateItemStatus({
        roundId: ticket.roundId,
        itemId: item.itemId,
        status,
        sessionId: ticket.sessionId,
      }).unwrap();
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not update that item'), 'error'));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleAllReady(ticket: KdsTicket) {
    try {
      await updateRoundStatus({
        roundId: ticket.roundId,
        status: ITEM_STATUS.READY,
        sessionId: ticket.sessionId,
      }).unwrap();
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not mark the ticket ready'), 'error'));
    }
  }

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <StationTab
          active={station === 'all'}
          label="All"
          onClick={() => dispatch(kitchenStationFilterChanged('all'))}
        />
        {KITCHEN_STATION_VALUES.map((value: KitchenStation) => (
          <StationTab
            key={value}
            active={station === value}
            label={value}
            onClick={() => dispatch(kitchenStationFilterChanged(value))}
          />
        ))}

        <span className="text-ink-muted ml-1 text-sm tabular-nums">{visible.length} live</span>

        <button
          type="button"
          onClick={() => dispatch(kitchenSoundToggled())}
          aria-pressed={soundEnabled}
          title={soundEnabled ? 'Sound on' : 'Sound off'}
          className="border-line bg-surface ml-auto flex size-10 items-center justify-center rounded-lg border text-lg"
        >
          {soundEnabled ? '🔔' : '🔕'}
        </button>
      </div>

      <BillingNowPanel tables={grid.data?.tables ?? []} />

      <div className="flex-1">
        {queue.isLoading ? (
          <LoadingBlock label="Loading the board…" />
        ) : queue.isError ? (
          <ErrorState
            message={apiErrorMessage(queue.error, 'Could not load the queue')}
            onRetry={() => void queue.refetch()}
          />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <span aria-hidden className="text-6xl">
              ✓
            </span>
            <p className="text-2xl font-bold">All caught up</p>
            <p className="text-ink-muted">New tickets appear here the moment they are placed.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3">
            {visible.map((ticket) => (
              <KotTicketCard
                key={ticket.roundId}
                ticket={ticket}
                busyItemId={busyItemId}
                onItemStatus={(target, item, status) => void handleItemStatus(target, item, status)}
                onAllReady={(target) => void handleAllReady(target)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StationTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-10 rounded-lg px-3 text-sm font-bold transition',
        active ? 'bg-brand-600 text-white' : 'border-line bg-surface text-ink-muted border',
      )}
    >
      {label}
    </button>
  );
}
