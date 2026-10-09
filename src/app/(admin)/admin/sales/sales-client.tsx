'use client';

import { useState } from 'react';

import { IconSales } from '@/components/ui/icons';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import type { DailySalesRow } from '@/lib/types';
import { cn, formatBillTotal, formatCurrency } from '@/lib/utils';
import { useDailySalesQuery } from '@/store/api/admin-api';
import { apiErrorMessage } from '@/store/api/base-query';

/**
 * Today in the café's calendar, `YYYY-MM-DD`.
 *
 * Asia/Kolkata, the same zone the backend books each bill's day in, so a phone
 * left on another timezone still asks for the right day. `en-CA` is used only
 * because it formats as ISO.
 */
function cafeToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Pure calendar arithmetic on a `YYYY-MM-DD`; UTC is only a counting device. */
function shiftDay(day: string, by: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

/** "Wed, 08 Oct 2026" — the weekday is what an owner scans a month by. */
function formatDay(day: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${day}T00:00:00.000Z`));
}

/** +₹0.50 / −₹0.05 — a round off can go either way, so it always shows its sign. */
function formatSigned(amount: number): string {
  if (amount === 0) return formatCurrency(0);
  return `${amount < 0 ? '−' : '+'}${formatCurrency(Math.abs(amount))}`;
}

interface Range {
  from: string;
  to: string;
}

const PRESETS: { key: string; label: string; range: (today: string) => Range }[] = [
  { key: 'today', label: 'Today', range: (today) => ({ from: today, to: today }) },
  { key: '7', label: '7 days', range: (today) => ({ from: shiftDay(today, -6), to: today }) },
  { key: '30', label: '30 days', range: (today) => ({ from: shiftDay(today, -29), to: today }) },
  {
    key: 'month',
    label: 'This month',
    range: (today) => ({ from: `${today.slice(0, 8)}01`, to: today }),
  },
];

/**
 * Day-wise sales — the owner's end-of-day screen.
 *
 * One row per café day: how many bills, what they came to before tax, the tax,
 * the round off and the total collected. **Paid bills only** — see
 * `dailySales` in the backend for why — so this is the figure that should be
 * in the drawer, and it matches the Excel export for the same days.
 */
export function SalesClient() {
  const [today] = useState(cafeToday);
  const [preset, setPreset] = useState<string | null>('30');
  const [range, setRange] = useState<Range>(() => ({ from: shiftDay(today, -29), to: today }));

  const sales = useDailySalesQuery(range);
  const report = sales.data;

  function pick(key: string) {
    const match = PRESETS.find((item) => item.key === key);
    if (!match) return;
    setPreset(key);
    setRange(match.range(today));
  }

  function setEdge(edge: keyof Range, value: string) {
    // A cleared date input sends '' — ignore it rather than ask for nonsense.
    if (!value) return;
    setPreset(null);
    setRange((current) => ({ ...current, [edge]: value }));
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold">Day-wise sales</h1>
          <p className="text-ink-muted text-sm">
            Paid bills only, each rounded to the rupee. A bill counts on the day it was generated.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => pick(item.key)}
                aria-pressed={preset === item.key}
                className={cn(
                  'min-h-touch rounded-lg px-3 text-sm font-medium transition',
                  preset === item.key
                    ? 'bg-brand-600 text-white'
                    : 'border-line bg-surface text-ink-muted hover:text-ink border',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted font-medium">From</span>
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(event) => setEdge('from', event.target.value)}
              className="min-h-touch border-line bg-surface rounded-lg border px-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted font-medium">To</span>
            <input
              type="date"
              value={range.to}
              min={range.from}
              max={today}
              onChange={(event) => setEdge('to', event.target.value)}
              className="min-h-touch border-line bg-surface rounded-lg border px-3"
            />
          </label>
        </div>
      </header>

      {sales.isLoading ? (
        <LoadingBlock label="Adding up the days…" />
      ) : sales.isError || !report ? (
        <ErrorState
          message={apiErrorMessage(sales.error, 'Could not load the sales')}
          onRetry={() => void sales.refetch()}
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total sale" value={formatBillTotal(report.totals.total)} strong />
            <Stat label="Bills" value={String(report.totals.bills)} />
            <Stat label="Tax" value={formatCurrency(report.totals.tax)} />
            <Stat label="Round off" value={formatSigned(report.totals.roundOff)} />
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
      )}
    </div>
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
          — no paid bills
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

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-card border-line bg-surface border px-4 py-3">
      <dt className="text-ink-muted text-sm">{label}</dt>
      <dd className={cn('font-bold tabular-nums', strong ? 'text-2xl' : 'text-xl')}>{value}</dd>
    </div>
  );
}
