'use client';

import Link from 'next/link';
import { memo } from 'react';

import { IconRequest } from '@/components/ui/icons';
import { TILE_STATUS_STYLE } from '@/components/ui/status-pill';
import { TILE_EMPTY } from '@/lib/constants';
import type { LiveTableTile } from '@/lib/types';
import { cn, formatCurrencyShort, formatElapsed } from '@/lib/utils';

/**
 * One tile on the live table screen.
 *
 * Colour is never the only signal — every tile carries an icon and a written
 * status too, so a colour-blind waiter reads the floor exactly as fast as
 * anyone else (§5).
 *
 * `needsAttention` comes from the server, which knows the escalation
 * thresholds. When it is set the tile pulses: someone has been waiting too
 * long, or food is going cold under the pass.
 */
function TableGridCellComponent({ tile }: { tile: LiveTableTile }) {
  const style = TILE_STATUS_STYLE[tile.status] ?? TILE_STATUS_STYLE[TILE_EMPTY];
  const StatusIcon = style.icon;
  const isEmpty = tile.status === TILE_EMPTY;

  return (
    <Link
      href={`/waiter/${tile.tableId}`}
      aria-label={`Table ${tile.code}, ${style.label}`}
      className={cn(
        'rounded-card relative flex min-h-28 flex-col justify-between border-2 p-2.5 transition',
        'hover:-translate-y-0.5 hover:shadow-md focus-visible:-translate-y-0.5',
        style.className,
        tile.needsAttention && !isEmpty && 'animate-pulse-attention border-status-cancelled',
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-xl leading-none font-bold">{tile.code}</span>
        <StatusIcon aria-hidden className="size-4 shrink-0" />
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-xs leading-tight font-semibold">{style.label}</span>

        {!isEmpty ? (
          <span className="text-xs tabular-nums opacity-80">
            {formatElapsed(tile.minutesOpen)} · {formatCurrencyShort(tile.runningTotal)}
          </span>
        ) : (
          <span className="text-xs opacity-70">{tile.seatingCapacity} seats</span>
        )}
      </div>

      {/* Counters only when they mean something — a tile full of zeroes is noise. */}
      {tile.readyItemCount > 0 || tile.openServiceRequests > 0 ? (
        <div className="absolute -top-2 -right-2 flex gap-1">
          {tile.readyItemCount > 0 ? (
            <span
              title={`${tile.readyItemCount} item(s) ready to serve`}
              className="bg-status-ready flex size-6 items-center justify-center rounded-full text-xs font-bold text-white shadow"
            >
              {tile.readyItemCount}
            </span>
          ) : null}
          {tile.openServiceRequests > 0 ? (
            <span
              title={`${tile.openServiceRequests} open request(s)`}
              className="bg-status-cancelled flex size-6 items-center justify-center rounded-full text-white shadow"
            >
              <IconRequest aria-hidden className="size-3.5" />
            </span>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}

/**
 * Memoised: the grid repaints on every socket event on the floor, and one
 * table changing must not re-render the other twenty-three.
 */
export const TableGridCell = memo(TableGridCellComponent);
