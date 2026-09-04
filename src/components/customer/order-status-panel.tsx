'use client';

import { StatusPill } from '@/components/ui/status-pill';
import { ITEM_STATUS, type ItemStatus } from '@/lib/constants';
import type { CustomerRound } from '@/lib/types';
import { formatClock, formatCurrency, formatElapsed } from '@/lib/utils';

/**
 * The guest's live view of what they ordered.
 *
 * One card per round, because that is how the kitchen cooks it: a round placed
 * fifteen minutes later is a separate job with its own timer, not an edit of
 * the first one.
 */

/** The four words a guest actually cares about, in order. */
const CUSTOMER_STEPS: ItemStatus[] = [
  ITEM_STATUS.PENDING,
  ITEM_STATUS.PREPARING,
  ITEM_STATUS.READY,
  ITEM_STATUS.SERVED,
];

const STEP_LABEL: Record<string, string> = {
  [ITEM_STATUS.PENDING]: 'Placed',
  [ITEM_STATUS.PREPARING]: 'Preparing',
  [ITEM_STATUS.READY]: 'Ready',
  [ITEM_STATUS.SERVED]: 'Served',
};

interface OrderStatusPanelProps {
  rounds: CustomerRound[];
  runningTotal: number | null;
}

export function OrderStatusPanel({ rounds, runningTotal }: OrderStatusPanelProps) {
  if (rounds.length === 0) return null;

  return (
    <section aria-label="Your orders" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">Your order</h2>
        {runningTotal !== null ? (
          <span className="text-ink-muted text-sm">
            Running total{' '}
            <span className="text-ink font-semibold tabular-nums">
              {formatCurrency(runningTotal)}
            </span>
          </span>
        ) : null}
      </div>

      {rounds.map((round) => (
        <RoundCard key={round.kotId} round={round} />
      ))}
    </section>
  );
}

function RoundCard({ round }: { round: CustomerRound }) {
  // `accepted` is an internal kitchen state; to a guest it is still "preparing".
  const displayStatus =
    round.status === ITEM_STATUS.ACCEPTED ? ITEM_STATUS.PREPARING : round.status;
  const currentStep = CUSTOMER_STEPS.indexOf(displayStatus as ItemStatus);

  return (
    <article className="rounded-card border-line bg-surface border p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {round.roundNumber > 1 ? `Added order #${round.roundNumber}` : 'Order'}
          </h3>
          <p className="text-ink-muted text-sm">
            {formatClock(round.placedAt)} · {formatElapsed(round.elapsedMinutes)} ago
          </p>
        </div>
        <StatusPill status={displayStatus} size="md" />
      </header>

      {/* A four-step rail, so the guest can see progress without reading. */}
      <ol className="mb-3 flex items-center gap-1">
        {CUSTOMER_STEPS.map((step, index) => {
          const reached = currentStep >= index;
          return (
            <li key={step} className="flex flex-1 flex-col items-center gap-1">
              <span
                aria-hidden
                className={`h-1.5 w-full rounded-full ${
                  reached ? 'bg-status-ready' : 'bg-surface-sunken'
                }`}
              />
              <span
                className={`text-[0.7rem] font-medium ${
                  reached ? 'text-status-ready-ink' : 'text-ink-muted'
                }`}
              >
                {STEP_LABEL[step]}
              </span>
            </li>
          );
        })}
      </ol>

      <ul className="flex flex-col gap-1.5">
        {round.items.map((item, index) => (
          <li
            key={`${item.displayName}-${index}`}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <span className="min-w-0">
              <span className="font-medium tabular-nums">{item.quantity}×</span>{' '}
              <span>{item.displayName}</span>
              {item.specialInstructions ? (
                <span className="text-ink-muted block">↳ {item.specialInstructions}</span>
              ) : null}
            </span>
            <StatusPill status={item.status} />
          </li>
        ))}
      </ul>
    </article>
  );
}
