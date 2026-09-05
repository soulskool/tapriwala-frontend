'use client';

import { StatusPill } from '@/components/ui/status-pill';
import { ITEM_STATUS, type ItemStatus } from '@/lib/constants';
import type { OrderItem, OrderRound } from '@/lib/types';
import { cn, formatClockWithDay, formatCurrency, formatElapsed } from '@/lib/utils';

interface SessionRoundsProps {
  rounds: OrderRound[];
  onItemStatus: (round: OrderRound, item: OrderItem, status: ItemStatus) => void;
  onCancelItem: (round: OrderRound, item: OrderItem) => void;
  busyItemId?: string | null;
}

/**
 * Everything this table has ordered, round by round.
 *
 * Rounds are never merged here — that is the KDS's view of the world and the
 * waiter's too. Merging by product code happens exactly once, on the billing
 * screen, and nowhere else.
 */
export function SessionRounds({
  rounds,
  onItemStatus,
  onCancelItem,
  busyItemId,
}: SessionRoundsProps) {
  return (
    <div className="flex flex-col gap-3">
      {rounds.map((round) => (
        <article key={round._id} className="rounded-card border-line bg-surface border">
          <header className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">
                Round {round.roundNumber}
                {round.isAddOn ? (
                  <span className="bg-brand-100 text-brand-800 ml-2 rounded-full px-2 py-0.5 text-xs font-bold">
                    ADD-ON
                  </span>
                ) : null}
              </h3>
              <span className="text-ink-muted text-sm">KOT {round.kotId}</span>
            </div>

            <div className="text-ink-muted flex items-center gap-2 text-sm">
              <span>
                {formatClockWithDay(round.placedAt)} · {formatElapsed(round.elapsedMinutes)}
              </span>
              <StatusPill status={round.status} />
            </div>
          </header>

          <ul className="divide-line divide-y">
            {round.items.map((item) => (
              <ItemRow
                key={item._id}
                item={item}
                busy={busyItemId === item._id}
                onServe={() => onItemStatus(round, item, ITEM_STATUS.SERVED)}
                onCancel={() => onCancelItem(round, item)}
              />
            ))}
          </ul>

          <footer className="border-line bg-surface-muted flex items-center justify-between border-t px-4 py-2 text-sm">
            <span className="text-ink-muted">
              placed by {round.placedBy.name || round.source.replace('_', ' ')}
            </span>
            <span className="font-semibold tabular-nums">{formatCurrency(round.total)}</span>
          </footer>
        </article>
      ))}
    </div>
  );
}

interface ItemRowProps {
  item: OrderItem;
  busy: boolean;
  onServe: () => void;
  onCancel: () => void;
}

function ItemRow({ item, busy, onServe, onCancel }: ItemRowProps) {
  const cancelled = item.status === ITEM_STATUS.CANCELLED;
  const served = item.status === ITEM_STATUS.SERVED;

  return (
    <li className={cn('flex items-center gap-3 px-4 py-2.5', cancelled && 'opacity-55')}>
      <span className="w-8 shrink-0 text-lg font-bold tabular-nums">{item.quantity}×</span>

      <div className="min-w-0 flex-1">
        <p className={cn('font-medium', cancelled && 'line-through')}>{item.displayName}</p>
        {item.specialInstructions ? (
          <p className="text-status-preparing-ink text-sm font-medium">
            ↳ {item.specialInstructions}
          </p>
        ) : null}
        {cancelled && item.cancelReason ? (
          <p className="text-ink-muted text-sm">cancelled — {item.cancelReason}</p>
        ) : null}
      </div>

      <StatusPill status={item.status} />

      <div className="flex shrink-0 gap-1.5">
        {item.status === ITEM_STATUS.READY ? (
          <button
            type="button"
            disabled={busy}
            onClick={onServe}
            className="bg-status-served min-h-9 rounded-lg px-3 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
          >
            Served
          </button>
        ) : null}

        {!cancelled && !served ? (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label={`Cancel ${item.displayName}`}
            className="border-line text-ink-muted hover:border-status-cancelled hover:text-status-cancelled-ink min-h-9 rounded-lg border px-2.5 text-sm disabled:opacity-50"
          >
            ✕
          </button>
        ) : null}
      </div>
    </li>
  );
}
