'use client';

import { memo, useState } from 'react';

import { IconPrint, IconWarning } from '@/components/ui/icons';
import { ElapsedTimer } from '@/components/kitchen/elapsed-timer';
import { OrderTypePill } from '@/components/ui/order-type-pill';
import { useElapsedMinutes, urgencyFor } from '@/hooks/use-elapsed';
import { ITEM_STATUS, KITCHEN_SETTABLE_STATUSES, type ItemStatus } from '@/lib/constants';
import { isTicketAllReady, oldestOpenTicket, type KdsTableGroup } from '@/lib/kds-groups';
import type { KdsTicket, KdsTicketItem } from '@/lib/types';
import { ITEM_STATUS_LABEL, cn, formatClockWithDay, formatCurrencyShort } from '@/lib/utils';

interface KotTableCardProps {
  group: KdsTableGroup;
  /**
   * The status buttons. Omitted for a view-only admin, and so are the buttons:
   * the card then reads exactly as the kitchen sees it, with nothing to tap.
   */
  onItemStatus?: (ticket: KdsTicket, item: KdsTicketItem, status: ItemStatus) => void;
  /** "All ready". Omitted, with its button, wherever `onItemStatus` is. */
  onAllReady?: (ticket: KdsTicket) => void;
  /** Opens the print preview. The board owns the modal, not the card. */
  onPrintKot: (ticket: KdsTicket) => void;
  busyItemId?: string | null;
}

const BORDER_BY_URGENCY = {
  normal: 'border-line',
  urgent: 'border-status-pending',
  late: 'border-status-cancelled',
} as const;

/**
 * One table, as a card on the kitchen board, holding every round it is
 * waiting on.
 *
 * The rounds are stacked inside, not merged: two teas ordered an hour apart
 * are still two cooking jobs, each with its own KOT, timer and "All ready".
 * Billing is where they become one line — not here. What the card adds is that
 * a cook sees the whole table in one place, with the add-on marked.
 */
function KotTableCardComponent({
  group,
  onItemStatus,
  onAllReady,
  onPrintKot,
  busyItemId,
}: KotTableCardProps) {
  // The card's border follows the round the kitchen still owes, not round 1
  // once it is plated (see `oldestOpenTicket`).
  const lead = oldestOpenTicket(group);
  const minutes = useElapsedMinutes(lead.placedAt);
  const urgency = urgencyFor(minutes);
  const rounds = group.tickets.length;

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
          <span className="text-3xl leading-none font-black">{group.tableCode}</span>
          <p className="text-ink-muted mt-0.5 text-xs">
            {group.zone}
            {rounds > 1 ? ` · ${rounds} rounds` : null}
          </p>
        </div>
        <ElapsedTimer since={lead.placedAt} className="text-xl" />
      </header>

      <div className="divide-line flex flex-1 flex-col divide-y-4">
        {group.tickets.map((ticket) => (
          <RoundSection
            key={ticket.roundId}
            ticket={ticket}
            showTimer={rounds > 1}
            busyItemId={busyItemId}
            onItemStatus={onItemStatus}
            onAllReady={onAllReady}
            onPrintKot={onPrintKot}
          />
        ))}
      </div>
    </article>
  );
}

/**
 * One round inside the table card — the old ticket card, minus the outer box.
 */
function RoundSection({
  ticket,
  showTimer,
  onItemStatus,
  onAllReady,
  onPrintKot,
  busyItemId,
}: Omit<KotTableCardProps, 'group'> & { ticket: KdsTicket; showTimer: boolean }) {
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
  const allReady = isTicketAllReady(ticket);

  return (
    <section
      aria-label={`Round ${ticket.roundNumber}, KOT ${ticket.kotId}`}
      className="flex flex-col"
    >
      <div className="bg-surface-sunken flex items-start justify-between gap-2 px-3 py-1.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {ticket.isAddOn ? (
              <span className="bg-brand-500 rounded-md px-1.5 py-0.5 text-xs font-black text-white">
                ADD-ON R{ticket.roundNumber}
              </span>
            ) : (
              <span className="text-xs font-black">R{ticket.roundNumber}</span>
            )}
            {/* On each round, not the card: one table can send a dine-in round
                and then a parcel, and a cook plating a parcel packs it instead
                of dressing a plate. */}
            <OrderTypePill orderType={ticket.orderType} />
          </div>
          <p className="text-ink-muted mt-0.5 text-xs">
            KOT {ticket.kotId} · {formatClockWithDay(ticket.placedAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* The card header already shows the age of a single round. */}
          {showTimer ? <ElapsedTimer since={ticket.placedAt} className="text-sm" /> : null}
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
      </div>

      <ul className="divide-line flex flex-col divide-y">
        {ticket.items.map((item) => (
          <TicketItemRow
            key={item.itemId}
            item={item}
            busy={busyItemId === item.itemId}
            showPrice={showPrices}
            onStatus={onItemStatus ? (status) => onItemStatus(ticket, item, status) : undefined}
          />
        ))}
      </ul>

      {showPrices ? (
        <p className="border-line text-ink-muted flex items-baseline justify-between border-t px-3 py-2 text-sm tabular-nums">
          <span>Subtotal {formatCurrencyShort(ticket.subtotal)} + tax</span>
          <span className="text-ink text-base font-bold">{formatCurrencyShort(ticket.total)}</span>
        </p>
      ) : null}

      <footer className="border-line flex gap-2 border-t p-2">
        {/* Available for the whole life of the round, including after it is
            all ready: a lost or smudged docket gets reprinted, and that is
            most likely to be noticed once the food is under the pass. */}
        <button
          type="button"
          onClick={() => onPrintKot(ticket)}
          aria-label={`Preview and print KOT ${ticket.kotId}`}
          className="min-h-touch border-line text-ink hover:bg-surface-muted flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 text-base font-bold transition"
        >
          <IconPrint aria-hidden className="size-4" /> Print KOT
        </button>

        {!allReady && onAllReady ? (
          <button
            type="button"
            onClick={() => onAllReady(ticket)}
            className="min-h-touch bg-status-ready flex-1 rounded-lg text-base font-bold text-white transition hover:brightness-110 active:brightness-95"
          >
            {/* Says which round, so "All ready" on an add-on is never read as
                the whole table. */}
            {ticket.isAddOn ? `R${ticket.roundNumber} ready` : 'All ready'}
          </button>
        ) : null}
      </footer>
    </section>
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
  onStatus?: (status: ItemStatus) => void;
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
            <p className="text-status-cancelled mt-1 flex items-center gap-1.5 text-sm font-bold">
              <IconWarning aria-hidden className="size-4 shrink-0" />
              Marked unavailable: check with the floor
            </p>
          ) : null}
        </div>

        <span className="text-ink-muted shrink-0 text-xs font-bold uppercase">
          {ITEM_STATUS_LABEL[item.status]}
        </span>
      </div>

      {!done && !cancelled && onStatus ? (
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
export const KotTableCard = memo(KotTableCardComponent);
