'use client';

import { useState } from 'react';

import { DaySalesReport } from '@/components/sales/day-sales-report';
import { ItemSalesReport, type ItemSalesView } from '@/components/sales/item-sales-report';
import { SALES_PERIOD, type SalesPeriod } from '@/lib/constants';
import { cafeToday, shiftDay } from '@/lib/sales-dates';
import { cn } from '@/lib/utils';

interface Range {
  from: string;
  to: string;
}

/** The last day of the month before `day`'s. */
function endOfLastMonth(day: string): string {
  return shiftDay(`${day.slice(0, 8)}01`, -1);
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
  {
    key: 'last-month',
    label: 'Last month',
    range: (today) => {
      const to = endOfLastMonth(today);
      return { from: `${to.slice(0, 8)}01`, to };
    },
  },
  {
    key: 'year',
    label: 'This year',
    range: (today) => ({ from: `${today.slice(0, 4)}-01-01`, to: today }),
  },
];

type SalesView = 'days' | ItemSalesView;

/**
 * Every sales question on one screen, the way the old POS laid them out:
 * pick a range once, then flip between the views of it.
 */
const VIEWS: { key: SalesView; label: string; hint: string }[] = [
  {
    key: 'days',
    label: 'Day-wise',
    hint: 'What each day took. Paid bills only, each rounded to the rupee.',
  },
  {
    key: 'items',
    label: 'Item wise',
    hint: 'How much of each item sold, and what it brought in.',
  },
  {
    key: 'prices',
    label: 'Item wise (multi price)',
    hint: 'Each item split by the price it sold at — dining and parcel separately.',
  },
  {
    key: 'categories',
    label: 'Category wise',
    hint: 'Takings per menu category. Tap a category to see its items.',
  },
  {
    key: 'trend',
    label: 'Item by day / month',
    hint: 'How many of each item sold on each day, or in each month.',
  },
];

export function SalesClient() {
  const [today] = useState(cafeToday);
  const [view, setView] = useState<SalesView>('days');
  const [period, setPeriod] = useState<SalesPeriod>(SALES_PERIOD.DAY);
  const [preset, setPreset] = useState<string | null>('30');
  const [range, setRange] = useState<Range>(() => ({ from: shiftDay(today, -29), to: today }));

  const current = VIEWS.find((item) => item.key === view) ?? VIEWS[0]!;

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
    setRange((existing) => ({ ...existing, [edge]: value }));
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-ink-muted text-sm">
            {current.hint} A bill counts on the day it was generated.
          </p>
        </div>

        <nav aria-label="Sales reports" className="-mx-4 overflow-x-auto px-4">
          <div className="border-line flex min-w-max gap-1 border-b">
            {VIEWS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setView(item.key)}
                aria-current={view === item.key ? 'page' : undefined}
                className={cn(
                  'min-h-touch -mb-px border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition',
                  view === item.key
                    ? 'border-brand-600 text-brand-700'
                    : 'text-ink-muted hover:text-ink border-transparent',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

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

      {view === 'days' ? (
        <DaySalesReport range={range} today={today} />
      ) : (
        <ItemSalesReport range={range} view={view} period={period} onPeriodChange={setPeriod} />
      )}
    </div>
  );
}
