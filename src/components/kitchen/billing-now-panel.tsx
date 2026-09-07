'use client';

import { useState } from 'react';

import { IconBill, IconCheck, IconCollapse, IconExpand, IconWarning } from '@/components/ui/icons';
import type { LiveTableTile } from '@/lib/types';
import { cn, formatCurrencyShort, formatElapsed, sumBy } from '@/lib/utils';

/**
 * Which tables are settling up — on the kitchen board.
 *
 * The KDS only ever showed work still to cook, so a table that asked for its
 * bill looked identical to one about to order dessert. That matters in one
 * direction: a table with the bill requested and items still on the board is
 * the most urgent thing in the kitchen, because a guest is standing at the
 * counter waiting on food nobody has flagged.
 *
 * Read-only by design. The kitchen sees which tables are closing; generating,
 * confirming and closing a bill stay with the counter, enforced on the server.
 *
 * The data is the same live grid the waiter floor renders — the kitchen role
 * can already read `/tables`, and `SESSION_STATUS_CHANGE` broadcasts to every
 * staff room, so the socket middleware keeps this in step with no polling and
 * no new endpoint.
 */
export function BillingNowPanel({ tables }: { tables: LiveTableTile[] }) {
  const [open, setOpen] = useState(false);

  // Longest-open first: that is the table most likely to be standing there.
  const billing = tables
    .filter((tile) => tile.billRequested)
    .sort((a, b) => b.minutesOpen - a.minutesOpen);

  const stillCooking = sumBy(billing, (tile) => tile.pendingItemCount);

  return (
    <section aria-label="Tables being billed" className="mb-3 flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'rounded-card min-h-touch flex w-full items-center gap-2 border-2 px-3 text-sm font-bold transition sm:w-auto',
          billing.length > 0
            ? 'border-status-bill/40 bg-status-bill-soft text-status-bill-ink'
            : 'border-line bg-surface text-ink-muted',
        )}
      >
        <IconBill aria-hidden className="size-4 shrink-0" />
        <span>Billing now</span>
        <span className="tabular-nums">{billing.length}</span>

        {/* The whole reason the kitchen needs this panel, said on the button. */}
        {stillCooking > 0 ? (
          <span className="bg-status-cancelled rounded-full px-2 py-0.5 text-xs font-bold text-white tabular-nums">
            {stillCooking} still to cook
          </span>
        ) : null}

        {open ? (
          <IconCollapse aria-hidden className="ml-auto size-4 shrink-0" />
        ) : (
          <IconExpand aria-hidden className="ml-auto size-4 shrink-0" />
        )}
      </button>

      {open ? (
        billing.length === 0 ? (
          <p className="rounded-card border-line bg-surface text-ink-muted border px-3 py-3 text-sm">
            No table has asked for the bill right now.
          </p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2">
            {billing.map((tile) => (
              <BillingTableCard key={tile.tableId} tile={tile} />
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}

/**
 * One closing table.
 *
 * Red when the kitchen still owes it food, purple when it does not — and both
 * carry an icon and a written line, so the board reads the same to a
 * colour-blind cook (§5).
 */
function BillingTableCard({ tile }: { tile: LiveTableTile }) {
  const owed = tile.pendingItemCount;
  const underThePass = tile.readyItemCount;

  return (
    <li
      className={cn(
        'rounded-card flex flex-col gap-1 border-2 p-3',
        owed > 0
          ? 'border-status-cancelled bg-status-cancelled-soft text-status-cancelled-ink'
          : 'border-status-bill/40 bg-status-bill-soft text-status-bill-ink',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl leading-none font-bold">{tile.code}</span>
        <span className="text-xs font-semibold tabular-nums opacity-80">
          {formatCurrencyShort(tile.runningTotal)}
        </span>
      </div>

      <p className="flex items-center gap-1.5 text-sm leading-snug font-semibold">
        {owed > 0 ? (
          <>
            <IconWarning aria-hidden className="size-4 shrink-0" />
            {owed} item{owed === 1 ? '' : 's'} still to cook
          </>
        ) : (
          <>
            <IconCheck aria-hidden className="size-4 shrink-0" />
            Nothing left to cook
          </>
        )}
      </p>

      <p className="text-xs tabular-nums opacity-80">
        {underThePass > 0 ? `${underThePass} ready under the pass · ` : ''}
        {tile.zone} · open {formatElapsed(tile.minutesOpen)}
      </p>
    </li>
  );
}
