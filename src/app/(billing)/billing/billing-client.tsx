'use client';

import Link from 'next/link';
import { useState } from 'react';

import { CompletedBills } from '@/components/billing/completed-bills';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { StatusPill } from '@/components/ui/status-pill';
import { SESSION_STATUS } from '@/lib/constants';
import type { BillingQueueEntry, LiveTableTile } from '@/lib/types';
import { IconBill, IconCheck, IconWarning } from '@/components/ui/icons';
import { cn, formatCurrency, formatElapsed } from '@/lib/utils';
import { apiErrorMessage } from '@/store/api/base-query';
import { useBillingQueueQuery } from '@/store/api/billing-api';
import { useLiveGridQuery } from '@/store/api/table-api';

type Tab = 'live' | 'completed';

/**
 * The counter's home screen.
 *
 * Two lists on the live tab, because §4.4 asks for both: the tables that have
 * actually asked to pay, and every other open session so a biller can settle a
 * table that flagged someone down instead of tapping their phone.
 *
 * The completed tab is the receipt book — every bill ever generated, kept
 * because a bill number is a financial record and "find me that bill again" is
 * a question the counter genuinely asks.
 */
export function BillingQueueClient() {
  const [tab, setTab] = useState<Tab>('live');
  const queue = useBillingQueueQuery();
  const grid = useLiveGridQuery();

  const waiting = queue.data?.sessions ?? [];
  const waitingIds = new Set(waiting.map((entry) => entry.sessionId));

  const otherOpen = (grid.data?.tables ?? []).filter(
    (tile) =>
      tile.sessionId !== null &&
      tile.status !== SESSION_STATUS.CLOSED &&
      !waitingIds.has(tile.sessionId),
  );

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Billing views" className="print-hidden flex gap-2">
        <TabButton active={tab === 'live'} onClick={() => setTab('live')}>
          Open tables
          {waiting.length > 0 ? (
            <span className="bg-status-bill-soft text-status-bill-ink ml-2 rounded-full px-2 py-0.5 text-sm tabular-nums">
              {waiting.length}
            </span>
          ) : null}
        </TabButton>
        <TabButton active={tab === 'completed'} onClick={() => setTab('completed')}>
          Completed bills
        </TabButton>
      </div>

      {tab === 'completed' ? <CompletedBills /> : <LiveTab />}
    </div>
  );

  function LiveTab() {
    if (queue.isLoading) return <LoadingBlock label="Loading the counter…" />;
    if (queue.isError) {
      return (
        <ErrorState
          message={apiErrorMessage(queue.error, 'Could not load the billing queue')}
          onRetry={() => void queue.refetch()}
        />
      );
    }

    return (
      <div className="flex flex-col gap-8">
        <section aria-label="Waiting to be billed" className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">
            Asked for the bill
            <span className="bg-status-bill-soft text-status-bill-ink ml-2 rounded-full px-2 py-0.5 text-sm tabular-nums">
              {waiting.length}
            </span>
          </h2>

          {waiting.length === 0 ? (
            <EmptyState
              icon={<IconBill />}
              title="Nobody is waiting to pay"
              description="Tables appear here the moment a guest or waiter requests the bill."
            />
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {waiting.map((entry) => (
                <BillingQueueCard key={entry.sessionId} entry={entry} />
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Other open tables" className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">
            Other open tables
            <span className="text-ink-muted ml-2 text-sm font-normal tabular-nums">
              {otherOpen.length}
            </span>
          </h2>

          {otherOpen.length === 0 ? (
            <EmptyState icon={<IconCheck />} title="No other tables are open" />
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              {otherOpen.map((tile) => (
                <OpenTableCard key={tile.tableId} tile={tile} />
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }
}

/** A tab that stays legible without relying on colour alone. */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'min-h-touch rounded-card border px-4 py-2 font-semibold transition-colors',
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-line bg-surface text-ink-muted hover:bg-surface-muted',
      )}
    >
      {children}
    </button>
  );
}

function BillingQueueCard({ entry }: { entry: BillingQueueEntry }) {
  // Ten minutes at the counter with a card in hand is a long time.
  const overdue = entry.waitingMinutes >= 10;

  return (
    <li>
      <Link
        href={`/billing/${entry.sessionId}`}
        className={cn(
          'rounded-card bg-surface flex h-full flex-col gap-2 border-2 p-4 transition hover:shadow-md',
          overdue ? 'animate-pulse-attention border-status-cancelled' : 'border-status-bill',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-2xl font-bold">{entry.tableCode}</p>
            <p className="text-ink-muted text-sm">Session #{entry.sessionNumber}</p>
          </div>
          <span className="text-xl font-bold tabular-nums">
            {formatCurrency(entry.runningTotal)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={cn(
              'tabular-nums',
              overdue ? 'text-status-cancelled-ink font-semibold' : 'text-ink-muted',
            )}
          >
            waiting {formatElapsed(entry.waitingMinutes)}
          </span>
          <span className="text-ink-muted">· {entry.totalRounds} rounds</span>
        </div>

        {/* A late cancellation puts the session here rather than letting the
            discrepancy be absorbed silently. */}
        {entry.heldForReview ? (
          <p className="bg-status-pending-soft text-status-pending-ink rounded-lg px-2.5 py-1.5 text-sm font-medium">
            <IconWarning aria-hidden className="mr-1 inline size-4" /> Held for review
            {entry.reviewNote ? ` — ${entry.reviewNote}` : ''}
          </p>
        ) : null}
      </Link>
    </li>
  );
}

function OpenTableCard({ tile }: { tile: LiveTableTile }) {
  return (
    <li>
      <Link
        href={`/billing/${tile.sessionId}`}
        className="rounded-card border-line bg-surface hover:border-brand-300 flex h-full items-center justify-between gap-3 border p-3 transition"
      >
        <div>
          <p className="text-lg font-bold">{tile.code}</p>
          <p className="text-ink-muted text-sm tabular-nums">
            {formatElapsed(tile.minutesOpen)} · {tile.roundCount} rounds
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-semibold tabular-nums">{formatCurrency(tile.runningTotal)}</span>
          <StatusPill status={tile.status} kind="tile" />
        </div>
      </Link>
    </li>
  );
}
