'use client';

import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { IconSales } from '@/components/ui/icons';
import { formatDay, formatSigned } from '@/lib/sales-dates';
import type { DailySalesRow } from '@/lib/types';
import { cn, formatBillTotal, formatCurrency } from '@/lib/utils';
import { useDailySalesQuery } from '@/store/api/admin-api';
import { apiErrorMessage } from '@/store/api/base-query';

import { SalesStat } from './sales-stat';

/**
 * Day-wise sales — the owner's end-of-day view.
 *
 * One row per café day: how many bills, what they came to before tax, the tax,
 * the round off and the total collected. **Paid bills only** — see
 * `dailySales` in the backend for why — so this is the figure that should be
 * in the drawer, and it matches the Excel export for the same days.
 */
export function DaySalesReport({
  range,
  today,
}: {
  range: { from: string; to: string };
  today: string;
}) {
  const sales = useDailySalesQuery(range);
  const report = sales.data;

  if (sales.isLoading) return <LoadingBlock label="Adding up the days…" />;
  if (sales.isError || !report) {
    return (
      <ErrorState
        message={apiErrorMessage(sales.error, 'Could not load the sales')}
        onRetry={() => void sales.refetch()}
      />
    );
  }

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SalesStat label="Total sale" value={formatBillTotal(report.totals.total)} strong />
        <SalesStat label="Bills" value={String(report.totals.bills)} />
        <SalesStat label="Tax" value={formatCurrency(report.totals.tax)} />
        <SalesStat label="Round off" value={formatSigned(report.totals.roundOff)} />
      </dl>

      {report.totals.bills === 0 ? (
        <EmptyState
          icon={<IconSales />}
          title="No paid bills in this range"
          description="Pick a different range above."
        />
      ) : (
        // Scrolls inside its own box on a phone rather than pushing the
        // whole page sideways.
        <section
          aria-label="Sales by day"
          className={cn(
            'rounded-card border-line bg-surface overflow-x-auto border',
            sales.isFetching && 'opacity-60',
          )}
        >
          <table className="w-full min-w-[40rem] text-left">
            <thead className="border-line bg-surface-muted text-ink-muted border-b text-sm">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Date
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Bills
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Subtotal
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Tax
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Round off
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Total sale
                </th>
              </tr>
            </thead>
            <tbody>
              {report.days.map((row) => (
                <DayRow key={row.date} row={row} isToday={row.date === today} />
              ))}
            </tbody>
            <tfoot className="border-line bg-surface-muted border-t-2 font-bold">
              <tr>
                <th scope="row" className="px-3 py-2.5">
                  Total
                </th>
                <td className="px-3 py-2.5 text-right tabular-nums">{report.totals.bills}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatCurrency(report.totals.subtotal)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatCurrency(report.totals.tax)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatSigned(report.totals.roundOff)}
                </td>
                <td className="px-3 py-2.5 text-right text-lg tabular-nums">
                  {formatBillTotal(report.totals.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}
    </>
  );
}

function DayRow({ row, isToday }: { row: DailySalesRow; isToday: boolean }) {
  // A day with no paid bills reads as a dash, the way the old POS showed it —
  // a column of ₹0.00s hides the days that actually traded.
  const empty = row.bills === 0;
  const cell = 'px-3 py-2 text-right tabular-nums';

  return (
    <tr className={cn('border-line border-b last:border-b-0', isToday && 'bg-brand-50')}>
      <th scope="row" className="px-3 py-2 font-medium whitespace-nowrap">
        {formatDay(row.date)}
        {isToday ? (
          <span className="bg-brand-600 ml-2 rounded-full px-2 py-0.5 text-xs font-bold text-white">
            Today
          </span>
        ) : null}
      </th>
      {empty ? (
        <td colSpan={5} className="text-ink-muted px-3 py-2 text-right">
          No paid bills
        </td>
      ) : (
        <>
          <td className={cell}>{row.bills}</td>
          <td className={cell}>{formatCurrency(row.subtotal)}</td>
          <td className={cell}>{formatCurrency(row.tax)}</td>
          <td className={cell}>{formatSigned(row.roundOff)}</td>
          <td className={cn(cell, 'font-bold')}>{formatBillTotal(row.total)}</td>
        </>
      )}
    </tr>
  );
}
