'use client';

import Link from 'next/link';

import { TableGrid } from '@/components/table/table-grid';
import { ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { SERVICE_REQUEST_ICON } from '@/components/ui/icons';
import { cn, formatCurrency, formatElapsed } from '@/lib/utils';
import { useOverviewQuery } from '@/store/api/admin-api';
import { apiErrorMessage } from '@/store/api/base-query';

/**
 * The whole café on one screen, read-only.
 *
 * Kept read-only on purpose: this is the screen ownership leaves open, and an
 * accidental tap here should never change what the kitchen is cooking. The
 * action screens are one click away in the header.
 */
export function OverviewClient() {
  const overview = useOverviewQuery();

  if (overview.isLoading) return <LoadingBlock label="Reading the floor…" />;
  if (overview.isError || !overview.data) {
    return (
      <ErrorState
        message={apiErrorMessage(overview.error, 'Could not load the overview')}
        onRetry={() => void overview.refetch()}
      />
    );
  }

  const { summary, tables, kitchenQueue, serviceRequests, billingQueue, readyTooLong } =
    overview.data;

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Summary"
        className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-6"
      >
        <Stat label="Tables in use" value={`${summary.occupiedTables}/${summary.totalTables}`} />
        <Stat label="Running revenue" value={formatCurrency(summary.runningRevenue)} />
        <Stat label="Live tickets" value={String(summary.liveTickets)} />
        <Stat
          label="Open requests"
          value={String(summary.openServiceRequests)}
          tone={summary.escalatedRequests > 0 ? 'alert' : 'normal'}
          footnote={
            summary.escalatedRequests > 0 ? `${summary.escalatedRequests} escalated` : undefined
          }
        />
        <Stat label="Awaiting bill" value={String(summary.awaitingBill)} />
        <Stat
          label="Ready, unserved"
          value={String(summary.readyButUnserved)}
          tone={summary.readyButUnserved > 0 ? 'alert' : 'normal'}
        />
      </section>

      {/* `grid-cols-1` is deliberate: without a mobile template the implicit
       `auto` track sizes to its content's max-content and inflates the whole
       page sideways. `repeat(1, minmax(0,1fr))` gives it a zero floor. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_24rem]">
        <section aria-label="Floor">
          <h2 className="mb-3 text-lg font-bold">Floor</h2>
          <TableGrid tiles={tables} />
        </section>

        <div className="flex flex-col gap-5">
          <Panel title="Waiting on staff" count={serviceRequests.length}>
            {serviceRequests.length === 0 ? (
              <Muted>Nobody is waiting.</Muted>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {serviceRequests.map((request) => {
                  const Icon = SERVICE_REQUEST_ICON[request.type];
                  return (
                    <li
                      key={request.requestId ?? request._id}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm',
                        request.isEscalated ? 'bg-status-cancelled-soft' : 'bg-surface-muted',
                      )}
                    >
                      <Icon aria-hidden className="size-4 shrink-0" />
                      <span className="font-semibold">{request.tableCode}</span>
                      <span className="text-ink-muted flex-1">
                        {request.type.replace('_', ' ')}
                      </span>
                      <span
                        className={cn(
                          'tabular-nums',
                          request.isEscalated
                            ? 'text-status-cancelled-ink font-semibold'
                            : 'text-ink-muted',
                        )}
                      >
                        {formatElapsed(request.waitingMinutes)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Kitchen queue" count={kitchenQueue.length}>
            {kitchenQueue.length === 0 ? (
              <Muted>The kitchen is clear.</Muted>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {kitchenQueue.slice(0, 8).map((ticket) => (
                  <li
                    key={ticket.roundId}
                    className="bg-surface-muted flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm"
                  >
                    <span className="font-semibold">{ticket.tableCode}</span>
                    <span className="text-ink-muted flex-1 truncate">
                      {ticket.items
                        .map((item) => `${item.quantity}× ${item.displayName}`)
                        .join(', ')}
                    </span>
                    <span className="text-ink-muted tabular-nums">
                      {formatElapsed(ticket.elapsedMinutes)}
                    </span>
                  </li>
                ))}
                {kitchenQueue.length > 8 ? (
                  <li className="text-ink-muted text-sm">
                    <Link href="/kitchen" className="hover:underline">
                      + {kitchenQueue.length - 8} more on the board →
                    </Link>
                  </li>
                ) : null}
              </ul>
            )}
          </Panel>

          <Panel title="Ready, not served" count={readyTooLong.length}>
            {readyTooLong.length === 0 ? (
              <Muted>Nothing is sitting under the pass.</Muted>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {readyTooLong.map((round) => (
                  <li
                    key={round._id}
                    className="bg-status-ready-soft flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm"
                  >
                    <span className="font-semibold">{round.tableCode}</span>
                    <span className="text-ink-muted flex-1">KOT {round.kotId}</span>
                    <span className="text-status-ready-ink tabular-nums">
                      {formatElapsed(round.elapsedMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="At the counter" count={billingQueue.length}>
            {billingQueue.length === 0 ? (
              <Muted>Nobody is waiting to pay.</Muted>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {billingQueue.map((entry) => (
                  <li key={entry.sessionId}>
                    <Link
                      href={`/billing/${entry.sessionId}`}
                      className="bg-status-bill-soft flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:brightness-95"
                    >
                      <span className="font-semibold">{entry.tableCode}</span>
                      <span className="text-status-bill-ink flex-1 tabular-nums">
                        {formatCurrency(entry.runningTotal)}
                      </span>
                      <span className="text-ink-muted tabular-nums">
                        {formatElapsed(entry.waitingMinutes)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'normal',
  footnote,
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'alert';
  footnote?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-card bg-surface border px-3 py-2.5',
        tone === 'alert' ? 'border-status-cancelled' : 'border-line',
      )}
    >
      <p className="text-ink-muted text-xs">{label}</p>
      <p
        className={cn(
          'text-xl font-bold tabular-nums',
          tone === 'alert' && 'text-status-cancelled-ink',
        )}
      >
        {value}
      </p>
      {footnote ? <p className="text-status-cancelled-ink text-xs">{footnote}</p> : null}
    </div>
  );
}

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-card border-line bg-surface border p-3.5">
      <h2 className="text-ink-muted mb-2 text-sm font-semibold tracking-wide uppercase">
        {title}
        <span className="ml-1.5 tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-muted text-sm">{children}</p>;
}
