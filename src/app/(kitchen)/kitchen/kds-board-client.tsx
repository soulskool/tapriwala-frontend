'use client';

import { useMemo, useState } from 'react';

import { BillingNowPanel } from '@/components/kitchen/billing-now-panel';
import { KotPrintModal } from '@/components/kitchen/kot-print-modal';
import { KotTicketCard } from '@/components/kitchen/kot-ticket-card';
import type { KotData } from '@/components/kitchen/kot-sheet';
import { IconCheck, IconSoundOff, IconSoundOn } from '@/components/ui/icons';
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
  /**
   * The ticket whose paper is being previewed.
   *
   * Held here rather than on each card so exactly one preview can be open at
   * a time — and so the KOT is snapshotted at the moment the button was
   * pressed. A socket tick landing mid-preview must not change the sheet under
   * the hand about to print it.
   */
  const [printTarget, setPrintTarget] = useState<KotData | null>(null);

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

  /**
   * Maps a live ticket to the paper's shape.
   *
   * Built from the *unfiltered* round, not the station-filtered view: a cook
   * on the Beverage tab printing a mixed ticket must still hand the kitchen a
   * docket with the food on it, or half the order silently never gets cooked.
   */
  function handlePrintKot(ticket: KdsTicket) {
    const full = tickets.find((entry) => entry.roundId === ticket.roundId) ?? ticket;

    setPrintTarget({
      kotId: full.kotId,
      tableCode: full.tableCode,
      orderType: full.orderType,
      roundNumber: full.roundNumber,
      isAddOn: full.isAddOn,
      placedAt: full.placedAt,
      placedByName: full.placedByName,
      items: full.items.map((item) => ({
        displayName: item.displayName,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions,
        status: item.status,
      })),
    });
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
          {soundEnabled ? (
            <IconSoundOn aria-hidden className="size-5" />
          ) : (
            <IconSoundOff aria-hidden className="size-5" />
          )}
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
            <IconCheck aria-hidden className="text-status-ready size-14" />
            <p className="text-2xl font-bold">All caught up</p>
            <p className="text-ink-muted">New tickets appear here the moment they are placed.</p>
          </div>
        ) : (
          /*
           * `min(20rem,100%)` rather than a bare `20rem`: on a screen narrower
           * than the 20rem floor the track cannot shrink to fit, and the board
           * scrolls sideways. Tablets are wider than that, but a cook checking
           * the board on a phone should not have to pan it.
           */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-3">
            {visible.map((ticket) => (
              <KotTicketCard
                key={ticket.roundId}
                ticket={ticket}
                busyItemId={busyItemId}
                onItemStatus={(target, item, status) => void handleItemStatus(target, item, status)}
                onAllReady={(target) => void handleAllReady(target)}
                onPrintKot={handlePrintKot}
              />
            ))}
          </div>
        )}
      </div>

      <KotPrintModal
        kot={printTarget}
        open={printTarget !== null}
        onClose={() => setPrintTarget(null)}
      />
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
