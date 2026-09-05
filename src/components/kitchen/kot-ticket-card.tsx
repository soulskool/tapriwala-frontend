'use client';

import { memo, useState } from 'react';

import { ElapsedTimer } from '@/components/kitchen/elapsed-timer';
import { useElapsedMinutes, urgencyFor } from '@/hooks/use-elapsed';
import { ITEM_STATUS, KITCHEN_SETTABLE_STATUSES, type ItemStatus } from '@/lib/constants';
import type { KdsTicket, KdsTicketItem } from '@/lib/types';
import { ITEM_STATUS_LABEL, cn, formatClockWithDay, formatCurrencyShort } from '@/lib/utils';

interface KotTicketCardProps {
  ticket: KdsTicket;
  onItemStatus: (ticket: KdsTicket, item: KdsTicketItem, status: ItemStatus) => void;
  onAllReady: (ticket: KdsTicket) => void;
  busyItemId?: string | null;
}

const BORDER_BY_URGENCY = {
  normal: 'border-line',
  urgent: 'border-status-pending',
  late: 'border-status-cancelled',
} as const;

/**
 * One order round, as a card on the kitchen board.
 *
 * One card per round, never merged with another round for the same table:
 * two teas ordered an hour apart are two cooking jobs with two timers. Billing
 * is where they become one line — not here.
 */
function KotTicketCardComponent({
  ticket,
  onItemStatus,
  onAllReady,
  busyItemId,
}: KotTicketCardProps) {
  const minutes = useElapsedMinutes(ticket.placedAt);
  const urgency = urgencyFor(minutes);

  /*
   * Per-item rates stay folded away by default.
   *
   * The card's job is still "cook this" — a column of prices next to every
   * line competes with the quantity, which is the number that must be readable
   * from across the kitchen. The round total is always on show because that is
   * what gets shouted over the pass; the breakdown is one tap away for the
   * times someone actually needs it.
   */
  const [showPrices, setShowPrices] = useState(false);

  const liveItems = ticket.items.filter((item) => item.status !== ITEM_STATUS.CANCELLED);
  const allReady =
    liveItems.length > 0 &&
    liveItems.every(
      (item) => item.status === ITEM_STATUS.READY || item.status === ITEM_STATUS.SERVED,
    );

  return (
    <article
      className={cn(
        'rounded-card bg-surface flex flex-col border-2 shadow-sm',
        BORDER_BY_URGENCY[urgency],
        urgency === 'late' && 'animate-pulse-attention',
      )}
    >
      <header className="border-line flex items-start justify-between gap-2 border-b px-3 py-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-3xl leading-none font-black">{ticket.tableCode}</span>
            {ticket.isAddOn ? (
              <span className="bg-brand-500 rounded-md px-1.5 py-0.5 text-xs font-black text-white">
                ADD-ON R{ticket.roundNumber}
              </span>
            ) : null}
          </div>
          <p className="text-ink-muted mt-0.5 text-xs">
            KOT {ticket.kotId} · {formatClockWithDay(ticket.placedAt)} · {ticket.zone}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <ElapsedTimer since={ticket.placedAt} className="text-xl" />
          <button
            type="button"
            onClick={() => setShowPrices((current) => !current)}
            aria-expanded={showPrices}
            aria-label={`${showPrices ? 'Hide' : 'Show'} item rates for KOT ${ticket.kotId}`}
            className={cn(
              'rounded-lg border px-2 py-0.5 text-sm font-bold tabular-nums transition',
              showPrices
                ? 'border-brand-500 bg-brand-50 text-brand-800'
                : 'border-line text-ink-muted hover:bg-surface-muted',
            )}
          >
            {formatCurrencyShort(ticket.total)}
          </button>
        </div>
      </header>

      <ul className="divide-line flex flex-1 flex-col divide-y">
        {ticket.items.map((item) => (
          <TicketItemRow
            key={item.itemId}
            item={item}
            busy={busyItemId === item.itemId}
            showPrice={showPrices}
            onStatus={(status) => onItemStatus(ticket, item, status)}
          />
        ))}
      </ul>

      {showPrices ? (
        <p className="border-line text-ink-muted flex items-baseline justify-between border-t px-3 py-2 text-sm tabular-nums">
          <span>Subtotal {formatCurrencyShort(ticket.subtotal)} + tax</span>
          <span className="text-ink text-base font-bold">{formatCurrencyShort(ticket.total)}</span>
        </p>
      ) : null}

      {!allReady ? (
        <footer className="border-line border-t p-2">
          <button
            type="button"
            onClick={() => onAllReady(ticket)}
            className="min-h-touch bg-status-ready w-full rounded-lg text-base font-bold text-white transition hover:brightness-110 active:brightness-95"
          >
            All ready
          </button>
        </footer>
      ) : null}
    </article>
  );
}

const STATUS_BUTTON_STYLE: Record<string, string> = {
  [ITEM_STATUS.ACCEPTED]: 'bg-status-occupied',
  [ITEM_STATUS.PREPARING]: 'bg-status-preparing',
  [ITEM_STATUS.READY]: 'bg-status-ready',
};

function TicketItemRow({
  item,
  busy,
  showPrice,
  onStatus,
}: {
  item: KdsTicketItem;
  busy: boolean;
  showPrice: boolean;
  onStatus: (status: ItemStatus) => void;
}) {
  const done = item.status === ITEM_STATUS.READY || item.status === ITEM_STATUS.SERVED;
  const cancelled = item.status === ITEM_STATUS.CANCELLED;

  return (
    <li className={cn('px-3 py-2.5', cancelled && 'opacity-45')}>
      <div className="flex items-start gap-3">
        <span className="w-9 shrink-0 text-2xl leading-tight font-black tabular-nums">
          {item.quantity}×
        </span>

        <div className="min-w-0 flex-1">
          <p className={cn('text-lg leading-tight font-bold', cancelled && 'line-through')}>
            {item.displayName}
          </p>

          {showPrice ? (
            <p className="text-ink-muted mt-0.5 text-sm tabular-nums">
              {formatCurrencyShort(item.unitPrice)} × {item.quantity} ={' '}
              <span className="text-ink font-bold">{formatCurrencyShort(item.lineTotal)}</span>
            </p>
          ) : null}

          {/* Instructions get the loudest treatment on the card — dropping one
              silently is how a guest gets the wrong plate. */}
          {item.specialInstructions ? (
            <p className="bg-status-pending mt-1 rounded-md px-2 py-1 text-base leading-tight font-bold text-black">
              {item.specialInstructions}
            </p>
          ) : null}

          {/* The item was 86'd after this ticket was placed. Flag it — never
              hide it — so the cook can tell the waiter instead of guessing. */}
          {item.unavailable && !cancelled ? (
            <p className="text-status-cancelled mt-1 text-sm font-bold">
              ⚠ Marked unavailable — check with the floor
            </p>
          ) : null}
        </div>

        <span className="text-ink-muted shrink-0 text-xs font-bold uppercase">
          {ITEM_STATUS_LABEL[item.status]}
        </span>
      </div>

      {!done && !cancelled ? (
        <div className="mt-2 flex gap-1.5">
          {KITCHEN_SETTABLE_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              disabled={busy || item.status === status}
              onClick={() => onStatus(status)}
              className={cn(
                'min-h-touch flex-1 rounded-lg text-sm font-bold text-white transition',
                'hover:brightness-110 active:brightness-95 disabled:opacity-35',
                STATUS_BUTTON_STYLE[status],
              )}
            >
              {ITEM_STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Memoised. A busy board holds dozens of cards and every socket tick would
 * otherwise re-render all of them — including their timers.
 */
export const KotTicketCard = memo(KotTicketCardComponent);
