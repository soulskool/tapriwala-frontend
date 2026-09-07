'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { IconBill, IconCheck, IconPrint, IconWarning } from '@/components/ui/icons';
import { ReceiptSheet } from '@/components/billing/receipt-sheet';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { TextField } from '@/components/ui/field';
import { EXPORT_STATUS, ROLES } from '@/lib/constants';
import type { BillingExport } from '@/lib/types';
import { cn, formatClock, formatCurrency, formatDateTime, groupBy } from '@/lib/utils';
import { apiErrorMessage } from '@/store/api/base-query';
import { useListExportsQuery } from '@/store/api/billing-api';
import { useAppSelector } from '@/store/hooks';
import { canAccess } from '@/store/slices/auth-slice';

/**
 * Every bill that has ever been generated.
 *
 * The records already existed — `exportBill` has written a `BillingExport`
 * with a permanent bill number since day one — but nothing ever showed them
 * back, so a counter could generate a bill and have no way to find it again.
 *
 * Two groupings, because two roles ask different questions. The counter asks
 * "what did I just bill?" and wants it newest-first. A waiter asks "what was
 * M2 charged?" and wants it by table. The tab switches between them rather
 * than making either read the other's layout.
 *
 * Read-only for both roles: generating and confirming bills stays with the
 * billing role, enforced on the server, not here.
 */

const PAGE_SIZE = 25;

type Grouping = 'recent' | 'table';

export function CompletedBills() {
  const [grouping, setGrouping] = useState<Grouping>('recent');
  const [tableFilter, setTableFilter] = useState('');
  const [page, setPage] = useState(1);

  /** The bill currently on the paper. Rendered only while printing. */
  const [printing, setPrinting] = useState<BillingExport | null>(null);
  const [printedAt, setPrintedAt] = useState<string | null>(null);

  /*
   * Only the counter can open a session screen — `/billing/[sessionId]` is
   * billing-only on both the client guard and the server. A waiter reading this
   * same list would be bounced to the login page, so their rows are plain text.
   * Printing works for everyone: the saved bill carries its own line items, so
   * reprinting needs nothing the list has not already fetched.
   */
  const user = useAppSelector((state) => state.auth.user);
  const canOpenSession = canAccess(user, [ROLES.BILLING]);

  function handlePrint(bill: BillingExport) {
    setPrinting(bill);
    setPrintedAt(new Date().toISOString());
    // Two frames: one for React to paint the receipt, one for the browser to
    // lay it out before `print()` freezes the page on it.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  // Server-side filter so "M2" searches every bill ever, not just this page.
  const trimmed = tableFilter.trim();
  const { data, isLoading, isFetching, isError, error, refetch } = useListExportsQuery({
    page,
    limit: PAGE_SIZE,
    ...(trimmed ? { tableCode: trimmed } : {}),
  });

  const bills = useMemo(() => data?.items ?? [], [data]);
  const meta = data?.pagination;

  function changeFilter(value: string) {
    setTableFilter(value);
    setPage(1); // A new filter has its own page 1.
  }

  if (isLoading) return <LoadingBlock label="Loading billed sessions…" />;
  if (isError) {
    return (
      <ErrorState
        message={apiErrorMessage(error, 'Could not load the billed sessions')}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <>
      {/*
       * Hidden on screen, revealed only by `@media print`. Always a reprint —
       * anything in this list was printed or handed over at least once — so it
       * carries the DUPLICATE stamp.
       */}
      {printing ? (
        <ReceiptSheet
          bill={{
            tableCode: printing.tableCode,
            lines: printing.lineItems,
            subtotal: printing.subtotal,
            tax: printing.tax,
            total: printing.total,
          }}
          billNumber={printing.billNumber}
          printedAt={printedAt ?? printing.generatedAt}
          isReprint
        />
      ) : null}

      <div className="print-hidden flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:max-w-56">
            <TextField
              label="Filter by table"
              value={tableFilter}
              onChange={(event) => changeFilter(event.target.value)}
              placeholder="e.g. M2"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div role="group" aria-label="Grouping" className="flex gap-2">
            <GroupButton active={grouping === 'recent'} onClick={() => setGrouping('recent')}>
              Most recent
            </GroupButton>
            <GroupButton active={grouping === 'table'} onClick={() => setGrouping('table')}>
              By table
            </GroupButton>
          </div>
        </div>

        {bills.length === 0 ? (
          <EmptyState
            icon={<IconBill />}
            title={trimmed ? `No bills for "${trimmed.toUpperCase()}"` : 'No bills generated yet'}
            description={
              trimmed
                ? 'Check the table code, or clear the filter to see every bill.'
                : 'Every bill you generate is saved here permanently, with its own bill number.'
            }
          />
        ) : (
          <div className={cn('flex flex-col gap-4', isFetching && 'opacity-60')}>
            {grouping === 'table' ? (
              <ByTable bills={bills} canOpen={canOpenSession} onPrint={handlePrint} />
            ) : (
              <BillList bills={bills} canOpen={canOpenSession} onPrint={handlePrint} />
            )}
          </div>
        )}

        {meta && meta.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-ink-muted text-sm tabular-nums">
              Page {meta.page} of {meta.totalPages} · {meta.total} bills
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={!meta.hasPrevPage}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Newer
              </Button>
              <Button
                variant="secondary"
                disabled={!meta.hasNextPage}
                onClick={() => setPage((current) => current + 1)}
              >
                Older
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Threaded down rather than put in a context — it is two levels, not ten. */
interface BillListProps {
  bills: BillingExport[];
  /** False for a waiter: the session screen would refuse them. */
  canOpen: boolean;
  onPrint: (bill: BillingExport) => void;
}

/** Bills grouped under a heading per table, ordered by table code. */
function ByTable({ bills, canOpen, onPrint }: BillListProps) {
  const grouped = [...groupBy(bills, (bill) => bill.tableCode)].sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  return (
    <div className="flex flex-col gap-5">
      {grouped.map(([tableCode, tableBills]) => {
        const total = tableBills.reduce((sum, bill) => sum + bill.total, 0);
        return (
          <section key={tableCode} aria-label={`Bills for table ${tableCode}`}>
            <h3 className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-lg font-bold">{tableCode}</span>
              <span className="text-ink-muted text-sm tabular-nums">
                {tableBills.length} {tableBills.length === 1 ? 'bill' : 'bills'} ·{' '}
                {formatCurrency(total)}
              </span>
            </h3>
            <BillList bills={tableBills} canOpen={canOpen} onPrint={onPrint} />
          </section>
        );
      })}
    </div>
  );
}

/** Cards on a phone, a table from `sm` up — this list matters on both. */
function BillList({ bills, canOpen, onPrint }: BillListProps) {
  return (
    <>
      <ul className="flex flex-col gap-2 sm:hidden">
        {bills.map((bill) => (
          <BillCard key={bill._id} bill={bill} canOpen={canOpen} onPrint={onPrint} />
        ))}
      </ul>

      <div className="rounded-card border-line bg-surface hidden overflow-x-auto border sm:block">
        <table className="w-full min-w-[42rem] text-left">
          <thead className="border-line bg-surface-muted text-ink-muted border-b text-sm">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                Bill
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Table
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Items
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Time
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Date
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Paid
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Total
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                <span className="sr-only">Print</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {bills.map((bill) => (
              <BillRow key={bill._id} bill={bill} canOpen={canOpen} onPrint={onPrint} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Whether the money was actually collected.
 *
 * This column used to report a POS hand-off. There is no second system to hand
 * anything to — the portal issues the only bill there is — so `confirmed` now
 * means the counter took payment and closed the table. A bill still reading
 * "not settled" is a table that was billed and then left open, which is exactly
 * what you want to catch at the end of a shift.
 */
function PaidStatus({ bill }: { bill: BillingExport }) {
  if (bill.exportStatus === EXPORT_STATUS.CONFIRMED) {
    return (
      <span className="text-status-ready-ink flex items-center gap-1 text-sm font-semibold">
        <IconCheck aria-hidden className="size-4 shrink-0" /> Paid
      </span>
    );
  }
  if (bill.exportStatus === EXPORT_STATUS.FAILED) {
    return (
      <span className="text-status-cancelled-ink flex items-center gap-1 text-sm font-semibold">
        <IconWarning aria-hidden className="size-4 shrink-0" /> Failed
      </span>
    );
  }
  return <span className="text-ink-muted text-sm">— Not settled</span>;
}

/** Reprints a stored bill. Everything it prints came with the list. */
function PrintButton({ bill, onPrint }: { bill: BillingExport; onPrint: () => void }) {
  return (
    <button
      type="button"
      onClick={onPrint}
      aria-label={`Print bill ${bill.billNumber} for table ${bill.tableCode}`}
      className="border-line bg-surface hover:bg-surface-muted min-h-touch flex items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold"
    >
      <IconPrint aria-hidden className="size-4 shrink-0" /> Print
    </button>
  );
}

/** "3 Sep" — the day only; the clock time gets its own column. */
function dayOf(iso: string): string {
  return formatDateTime(iso).split(',')[0] ?? '—';
}

function BillRow({
  bill,
  canOpen,
  onPrint,
}: { bill: BillingExport } & Omit<BillListProps, 'bills'>) {
  return (
    <tr className="hover:bg-surface-muted">
      <td className="px-3 py-2.5">
        {canOpen ? (
          <Link
            href={`/billing/${bill.sessionId}`}
            className="text-brand-700 font-semibold tabular-nums underline-offset-2 hover:underline"
          >
            #{bill.billNumber}
          </Link>
        ) : (
          <span className="font-semibold tabular-nums">#{bill.billNumber}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-lg font-bold">{bill.tableCode}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{bill.lineItems.length}</td>
      <td className="px-3 py-2.5 font-semibold tabular-nums">{formatClock(bill.generatedAt)}</td>
      <td className="text-ink-muted px-3 py-2.5 text-sm">{dayOf(bill.generatedAt)}</td>
      <td className="px-3 py-2.5">
        <PaidStatus bill={bill} />
      </td>
      <td className="px-3 py-2.5 text-right font-bold tabular-nums">
        {formatCurrency(bill.total)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <PrintButton bill={bill} onPrint={() => onPrint(bill)} />
      </td>
    </tr>
  );
}

function BillCard({
  bill,
  canOpen,
  onPrint,
}: { bill: BillingExport } & Omit<BillListProps, 'bills'>) {
  /*
   * The card body is a link only for the counter. A print button nested inside
   * a link is a trap on a touchscreen — the tap lands on whichever the browser
   * feels like — so the two never overlap: the details are the link, the print
   * button sits below it.
   */
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold">{bill.tableCode}</span>
        <span className="font-bold tabular-nums">{formatCurrency(bill.total)}</span>
      </div>
      <div className="text-ink-muted flex items-center justify-between gap-2 text-sm">
        <span className="tabular-nums">
          #{bill.billNumber} · {bill.lineItems.length} items
        </span>
        <PaidStatus bill={bill} />
      </div>
      <span className="text-ink-muted text-xs tabular-nums">
        {formatClock(bill.generatedAt)} · {dayOf(bill.generatedAt)}
      </span>
    </>
  );

  return (
    <li className="rounded-card border-line bg-surface flex flex-col gap-2 border p-3">
      {canOpen ? (
        <Link
          href={`/billing/${bill.sessionId}`}
          className="hover:bg-surface-muted active:bg-surface-sunken -m-1 flex flex-col gap-1 rounded-lg p-1"
        >
          {body}
        </Link>
      ) : (
        <div className="flex flex-col gap-1">{body}</div>
      )}
      <PrintButton bill={bill} onPrint={() => onPrint(bill)} />
    </li>
  );
}

function GroupButton({
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
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-touch rounded-card border px-3 py-2 text-sm font-semibold transition-colors',
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-line bg-surface text-ink-muted hover:bg-surface-muted',
      )}
    >
      {children}
    </button>
  );
}
