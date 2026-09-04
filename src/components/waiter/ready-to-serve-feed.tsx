'use client';

import Link from 'next/link';

import { EmptyState } from '@/components/ui/feedback';
import { ITEM_STATUS, UI_THRESHOLDS } from '@/lib/constants';
import type { OrderRound } from '@/lib/types';
import { cn, formatElapsed } from '@/lib/utils';

interface ReadyToServeFeedProps {
  rounds: OrderRound[];
  onServe: (round: OrderRound) => void;
  busyRoundId?: string | null;
}

/**
 * Food sitting under the pass, waiting for someone to carry it.
 *
 * This is the other half of the escalation story: a guest who has stopped
 * waiting for *attention* can still be waiting for their food to walk the last
 * ten metres, and nothing else on the floor screen would show that.
 */
export function ReadyToServeFeed({ rounds, onServe, busyRoundId }: ReadyToServeFeedProps) {
  if (rounds.length === 0) {
    return <EmptyState icon="🍽" title="Nothing waiting to be served" />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {rounds.map((round) => {
        const readyItems = round.items.filter((item) => item.status === ITEM_STATUS.READY);
        const late = round.elapsedMinutes >= UI_THRESHOLDS.READY_UNSERVED_MINUTES;

        return (
          <li
            key={round._id}
            className={cn(
              'rounded-card bg-surface flex items-center gap-3 border-2 p-3',
              late ? 'border-status-ready' : 'border-line',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                <Link href={`/waiter/${round.tableId}`} className="hover:underline">
                  {round.tableCode}
                </Link>
                <span className="text-ink-muted ml-2 font-normal">KOT {round.kotId}</span>
              </p>
              <p className="text-ink-muted truncate text-sm">
                {readyItems.map((item) => `${item.quantity}× ${item.displayName}`).join(', ')}
              </p>
              <p
                className={cn(
                  'text-sm tabular-nums',
                  late ? 'text-status-ready-ink font-semibold' : 'text-ink-muted',
                )}
              >
                ready {formatElapsed(round.elapsedMinutes)} ago
              </p>
            </div>

            <button
              type="button"
              disabled={busyRoundId === round._id}
              onClick={() => onServe(round)}
              className="min-h-touch bg-status-served shrink-0 rounded-xl px-4 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
            >
              Served
            </button>
          </li>
        );
      })}
    </ul>
  );
}
