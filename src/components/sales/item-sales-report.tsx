'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import {
  IconCollapse,
  IconDownload,
  IconExpand,
  IconSales,
  IconSearch,
} from '@/components/ui/icons';
import { OrderTypePill } from '@/components/ui/order-type-pill';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { SALES_PERIOD, type SalesPeriod } from '@/lib/constants';
import { formatPeriod } from '@/lib/sales-dates';
import type { CategorySalesRow, ItemSalesReport, ItemSalesRow } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import { downloadItemSalesXlsx, useItemSalesQuery } from '@/store/api/admin-api';
import { apiErrorMessage } from '@/store/api/base-query';
import { useAppDispatch } from '@/store/hooks';
import { toastPushed } from '@/store/slices/ui-slice';

import { SalesStat } from './sales-stat';

export type ItemSalesView = 'items' | 'prices' | 'categories' | 'trend';

type SortKey = 'total' | 'quantity' | 'name' | 'code';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'total', label: 'Highest sales' },
  { key: 'quantity', label: 'Most sold' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'code', label: 'Code' },
];

const SORTERS: Record<SortKey, (a: ItemSalesRow, b: ItemSalesRow) => number> = {
  total: (a, b) => b.total - a.total || a.name.localeCompare(b.name),
  quantity: (a, b) => b.quantity - a.quantity || b.total - a.total,
  name: (a, b) => a.name.localeCompare(b.name),
  code: (a, b) => a.productCode.localeCompare(b.productCode, undefined, { numeric: true }),
};

const TH = 'px-3 py-2 font-semibold';
const NUM = 'px-3 py-2 text-right tabular-nums';
const FOOT = 'px-3 py-2.5 text-right tabular-nums';

/**
 * Item-wise sales — what sold, how much of it, at which price, and when.
 *
 * One request feeds all four views, so flipping between them is instant and
 * every view adds up to the same totals. Same paid-bills rule as Day-wise.
 */
export function ItemSalesReport({
  range,
  view,
  period,
  onPeriodChange,
}: {
  range: { from: string; to: string };
  view: ItemSalesView;
  period: SalesPeriod;
  onPeriodChange: (period: SalesPeriod) => void;
}) {
  const dispatch = useAppDispatch();
  const params = { ...range, period };
  const sales = useItemSalesQuery(params);
  const report = sales.data;

  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search).trim().toLowerCase();
  const [sort, setSort] = useState<SortKey>('total');
  const [downloading, setDownloading] = useState(false);

  const items = useMemo(() => {
    if (!report) return [];
    const matched = query
      ? report.items.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            item.productCode.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query),
        )
      : report.items;
    return [...matched].sort(SORTERS[sort]);
  }, [report, query, sort]);

  async function download() {
    setDownloading(true);
    try {
      await downloadItemSalesXlsx(params, `item-sales-${range.from}-to-${range.to}.xlsx`);
    } catch (error) {
      dispatch(
        toastPushed(
          error instanceof Error ? error.message : 'Could not download the report',
          'error',
        ),
      );
    } finally {
      setDownloading(false);
    }
  }

  if (sales.isLoading) return <LoadingBlock label="Counting every item…" />;
  if (sales.isError || !report) {
    return (
      <ErrorState
        message={apiErrorMessage(sales.error, 'Could not load the item sales')}
        onRetry={() => void sales.refetch()}
      />
    );
  }

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SalesStat label="Sales incl. tax" value={formatCurrency(report.totals.total)} strong />
        <SalesStat label="Items sold" value={String(report.totals.quantity)} />
        <SalesStat label="Before tax" value={formatCurrency(report.totals.amount)} />
        <SalesStat label="Bills" value={String(report.totals.bills)} />
      </dl>

      {report.items.length === 0 ? (
        <EmptyState
          icon={<IconSales />}
          title="Nothing sold in this range"
          description="Only paid bills count. Pick a different range above."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="relative min-w-[14rem] flex-1">
              <span className="sr-only">Search items</span>
              <IconSearch
                aria-hidden
                className="text-ink-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search item, code or category"
                className="min-h-touch border-line bg-surface w-full rounded-lg border pr-3 pl-9"
              />
            </label>

            {view === 'items' || view === 'prices' ? (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-ink-muted font-medium">Sort</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  className="min-h-touch border-line bg-surface rounded-lg border px-3"
                >
                  {SORTS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {view === 'trend' ? <PeriodToggle value={period} onChange={onPeriodChange} /> : null}

            <Button
              variant="secondary"
              size="sm"
              onClick={() => void download()}
              isLoading={downloading}
              leadingIcon={<IconDownload aria-hidden className="size-4" />}
            >
              Excel report
            </Button>
          </div>

          <div className={cn(sales.isFetching && 'opacity-60')}>
            {items.length === 0 ? (
              <EmptyState
                icon={<IconSearch />}
                title="No item matches that search"
                description="Try part of the name or the item code."
              />
            ) : view === 'items' ? (
              <ItemsTable items={items} />
            ) : view === 'prices' ? (
              <PricesTable items={items} />
            ) : view === 'categories' ? (
              <CategoryList categories={report.categories} items={items} />
            ) : (
              <TrendTable report={report} items={items} />
            )}
          </div>

          <p className="text-ink-muted text-xs">
            Item totals include tax but not each bill&apos;s round off, so the grand total can
            differ from Day-wise by a few rupees. Categories are today&apos;s menu categories.
          </p>
        </>
      )}
    </>
  );
}

// ─── Item wise ───────────────────────────────────────────────────────────────

function ItemsTable({ items }: { items: ItemSalesRow[] }) {
  return (
    <section
      aria-label="Sales by item"
      className="rounded-card border-line bg-surface overflow-x-auto border"
    >
      <table className="w-full min-w-[44rem] text-left">
        <thead className="border-line bg-surface-muted text-ink-muted border-b text-sm">
          <tr>
            <th scope="col" className={cn(TH, 'w-12')}>
              No
            </th>
            <th scope="col" className={TH}>
              Item
            </th>
            <th scope="col" className={TH}>
              Category
            </th>
            <th scope="col" className={cn(TH, 'text-right')}>
              Qty
            </th>
            <th scope="col" className={cn(TH, 'text-right')}>
              Amount
            </th>
            <th scope="col" className={cn(TH, 'text-right')}>
              Tax
            </th>
            <th scope="col" className={cn(TH, 'text-right')}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.productCode} className="border-line border-b last:border-b-0">
              <td className="text-ink-muted px-3 py-2 tabular-nums">{index + 1}</td>
              <th scope="row" className="px-3 py-2 font-medium">
                <ItemName item={item} />
              </th>
              <td className="text-ink-muted px-3 py-2 text-sm">{item.category}</td>
              <td className={cn(NUM, 'font-semibold')}>{item.quantity}</td>
              <td className={NUM}>{formatCurrency(item.amount)}</td>
              <td className={NUM}>{formatCurrency(item.tax)}</td>
              <td className={cn(NUM, 'font-bold')}>{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
        <TotalsFoot items={items} leading={3} />
      </table>
    </section>
  );
}

// ─── Item wise (multi price) ─────────────────────────────────────────────────

/** One row per item per price — dining and parcel, or a price that changed. */
function PricesTable({ items }: { items: ItemSalesRow[] }) {
  return (
    <section
      aria-label="Sales by item and price"
      className="rounded-card border-line bg-surface overflow-x-auto border"
    >
      <table className="w-full min-w-[44rem] text-left">
        <thead className="border-line bg-surface-muted text-ink-muted border-b text-sm">
          <tr>
            <th scope="col" className={TH}>
              Item
            </th>
            <th scope="col" className={TH}>
              Type
            </th>
            <th scope="col" className={cn(TH, 'text-right')}>
              Rate
            </th>
            <th scope="col" className={cn(TH, 'text-right')}>
              Qty
            </th>
            <th scope="col" className={cn(TH, 'text-right')}>
              Amount
            </th>
            <th scope="col" className={cn(TH, 'text-right')}>
              Tax
            </th>
          </tr>
        </thead>
        <tbody>
          {items.flatMap((item) =>
            item.prices.map((price, index) => (
              <tr
                key={`${item.productCode}-${price.orderType}-${price.unitPrice}`}
                className={cn(
                  'border-line',
                  // One rule under each item's block, not under every price.
                  index === item.prices.length - 1 && 'border-b last:border-b-0',
                )}
              >
                <th scope="row" className="px-3 py-2 font-medium">
                  {index === 0 ? (
                    <ItemName item={item} />
                  ) : (
                    <span className="sr-only">{item.name}</span>
                  )}
                </th>
                <td className="px-3 py-2">
                  <OrderTypePill orderType={price.orderType} size="sm" />
                </td>
                <td className={NUM}>{formatCurrency(price.unitPrice)}</td>
                <td className={cn(NUM, 'font-semibold')}>{price.quantity}</td>
                <td className={cn(NUM, 'font-bold')}>{formatCurrency(price.amount)}</td>
                <td className={NUM}>{formatCurrency(price.tax)}</td>
              </tr>
            )),
          )}
        </tbody>
        <tfoot className="border-line bg-surface-muted border-t-2 font-bold">
          <tr>
            <th scope="row" colSpan={3} className="px-3 py-2.5 text-left">
              Total
            </th>
            <td className={FOOT}>{items.reduce((sum, item) => sum + item.quantity, 0)}</td>
            <td className={FOOT}>
              {formatCurrency(items.reduce((sum, item) => sum + item.amount, 0))}
            </td>
            <td className={FOOT}>
              {formatCurrency(items.reduce((sum, item) => sum + item.tax, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

// ─── Category wise ───────────────────────────────────────────────────────────

function CategoryList({
  categories,
  items,
}: {
  categories: CategorySalesRow[];
  items: ItemSalesRow[];
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  // Items arrive already filtered by the search; a category with no match hides.
  const byCategory = new Map<string, ItemSalesRow[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const visible = categories.filter((row) => byCategory.has(row.category));
  const allOpen = visible.length > 0 && visible.every((row) => open.has(row.category));

  function toggle(category: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(allOpen ? new Set() : new Set(visible.map((row) => row.category)))}
          leadingIcon={
            allOpen ? (
              <IconCollapse aria-hidden className="size-4" />
            ) : (
              <IconExpand aria-hidden className="size-4" />
            )
          }
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </Button>
      </div>

      {visible.map((row) => {
        const isOpen = open.has(row.category);
        const rows = (byCategory.get(row.category) ?? []).sort(SORTERS.total);
        const panelId = `category-${row.category.replace(/\W+/g, '-')}`;

        return (
          <section
            key={row.category}
            className="rounded-card border-line bg-surface overflow-hidden border"
          >
            <h3>
              <button
                type="button"
                onClick={() => toggle(row.category)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="hover:bg-surface-muted flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                {isOpen ? (
                  <IconCollapse aria-hidden className="text-ink-muted size-5 shrink-0" />
                ) : (
                  <IconExpand aria-hidden className="text-ink-muted size-5 shrink-0" />
                )}
                <span className="flex-1">
                  <span className="block font-bold uppercase">{row.category}</span>
                  <span className="text-ink-muted text-sm">
                    {row.itemCount} {row.itemCount === 1 ? 'item' : 'items'} · {row.quantity} sold
                  </span>
                </span>
                <span className="text-lg font-bold tabular-nums">{formatCurrency(row.total)}</span>
              </button>
            </h3>

            {isOpen ? (
              <div id={panelId} className="border-line overflow-x-auto border-t">
                <table className="w-full min-w-[32rem] text-left">
                  <thead className="bg-surface-muted text-ink-muted text-sm">
                    <tr>
                      <th scope="col" className={TH}>
                        Item
                      </th>
                      <th scope="col" className={cn(TH, 'text-right')}>
                        Qty
                      </th>
                      <th scope="col" className={cn(TH, 'text-right')}>
                        Amount
                      </th>
                      <th scope="col" className={cn(TH, 'text-right')}>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => (
                      <tr key={item.productCode} className="border-line border-t">
                        <th scope="row" className="px-3 py-2 font-medium">
                          <ItemName item={item} />
                        </th>
                        <td className={cn(NUM, 'font-semibold')}>{item.quantity}</td>
                        <td className={NUM}>{formatCurrency(item.amount)}</td>
                        <td className={cn(NUM, 'font-bold')}>{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

// ─── Item by day / month ─────────────────────────────────────────────────────

/**
 * Items down the side, days or months across. Answers "how many teas did we
 * sell each day this month" at a glance. The item column stays pinned while a
 * month of days scrolls sideways.
 */
function TrendTable({ report, items }: { report: ItemSalesReport; items: ItemSalesRow[] }) {
  const [metric, setMetric] = useState<'quantity' | 'amount'>('quantity');
  const show = (value: number) => (metric === 'quantity' ? String(value) : formatCurrency(value));

  const columnTotals = report.periods.map((key) =>
    items.reduce((sum, item) => sum + (item.byPeriod[key]?.[metric] ?? 0), 0),
  );
  const grand = items.reduce(
    (sum, item) => sum + item[metric === 'quantity' ? 'quantity' : 'amount'],
    0,
  );

  return (
    <div className="flex flex-col gap-2">
      <fieldset className="flex items-center gap-1.5 self-start">
        <legend className="sr-only">Show</legend>
        {(
          [
            ['quantity', 'Quantity'],
            ['amount', 'Amount (before tax)'],
          ] as const
        ).map(([key, label]) => (
          <SegmentButton key={key} active={metric === key} onClick={() => setMetric(key)}>
            {label}
          </SegmentButton>
        ))}
      </fieldset>

      <section
        aria-label={`Item sales by ${report.period}`}
        className="rounded-card border-line bg-surface overflow-x-auto border"
      >
        <table className="text-left text-sm">
          <thead className="border-line bg-surface-muted text-ink-muted border-b">
            <tr>
              <th
                scope="col"
                className="bg-surface-muted border-line sticky left-0 z-10 min-w-[12rem] border-r px-3 py-2 font-semibold"
              >
                Item
              </th>
              {report.periods.map((key) => {
                const label = formatPeriod(key);
                return (
                  <th
                    key={key}
                    scope="col"
                    className="px-2 py-1.5 text-right font-semibold whitespace-nowrap"
                  >
                    <span className="block">{label.main}</span>
                    <span className="block text-xs font-normal">{label.sub}</span>
                  </th>
                );
              })}
              <th
                scope="col"
                className="bg-surface-muted border-line sticky right-0 border-l px-3 py-2 text-right font-semibold"
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.productCode} className="border-line border-b last:border-b-0">
                <th
                  scope="row"
                  className="bg-surface border-line sticky left-0 z-10 border-r px-3 py-2 font-medium"
                >
                  <ItemName item={item} />
                </th>
                {report.periods.map((key) => {
                  const value = item.byPeriod[key]?.[metric] ?? 0;
                  return (
                    <td
                      key={key}
                      className={cn(
                        'px-2 py-2 text-right whitespace-nowrap tabular-nums',
                        value === 0 ? 'text-ink-muted' : 'font-semibold',
                      )}
                    >
                      {value === 0 ? '–' : show(value)}
                    </td>
                  );
                })}
                <td className="bg-surface border-line sticky right-0 border-l px-3 py-2 text-right font-bold whitespace-nowrap tabular-nums">
                  {show(metric === 'quantity' ? item.quantity : item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-line bg-surface-muted border-t-2 font-bold">
            <tr>
              <th
                scope="row"
                className="bg-surface-muted border-line sticky left-0 z-10 border-r px-3 py-2.5"
              >
                Total
              </th>
              {columnTotals.map((value, index) => (
                <td
                  key={report.periods[index]}
                  className="px-2 py-2.5 text-right whitespace-nowrap tabular-nums"
                >
                  {value === 0 ? '–' : show(value)}
                </td>
              ))}
              <td className="bg-surface-muted border-line sticky right-0 border-l px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                {show(grand)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}

function PeriodToggle({
  value,
  onChange,
}: {
  value: SalesPeriod;
  onChange: (period: SalesPeriod) => void;
}) {
  return (
    <fieldset className="flex items-center gap-1.5">
      <legend className="sr-only">Group by</legend>
      <SegmentButton active={value === SALES_PERIOD.DAY} onClick={() => onChange(SALES_PERIOD.DAY)}>
        Per day
      </SegmentButton>
      <SegmentButton
        active={value === SALES_PERIOD.MONTH}
        onClick={() => onChange(SALES_PERIOD.MONTH)}
      >
        Per month
      </SegmentButton>
    </fieldset>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function SegmentButton({
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
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-touch rounded-lg px-3 text-sm font-medium transition',
        active
          ? 'bg-brand-600 text-white'
          : 'border-line bg-surface text-ink-muted hover:text-ink border',
      )}
    >
      {children}
    </button>
  );
}

function ItemName({ item }: { item: ItemSalesRow }) {
  return (
    <>
      <span className="block">{item.name}</span>
      <span className="text-ink-muted block text-xs font-normal">{item.productCode}</span>
    </>
  );
}

/** Qty / amount / tax / total over whatever rows are showing. */
function TotalsFoot({ items, leading }: { items: ItemSalesRow[]; leading: number }) {
  const sum = (pick: (item: ItemSalesRow) => number) =>
    items.reduce((acc, item) => acc + pick(item), 0);

  return (
    <tfoot className="border-line bg-surface-muted border-t-2 font-bold">
      <tr>
        <th scope="row" colSpan={leading} className="px-3 py-2.5 text-left">
          Total{' '}
          <span className="text-ink-muted text-sm font-normal">
            ({items.length} {items.length === 1 ? 'item' : 'items'})
          </span>
        </th>
        <td className={FOOT}>{sum((item) => item.quantity)}</td>
        <td className={FOOT}>{formatCurrency(sum((item) => item.amount))}</td>
        <td className={FOOT}>{formatCurrency(sum((item) => item.tax))}</td>
        <td className={cn(FOOT, 'text-lg')}>{formatCurrency(sum((item) => item.total))}</td>
      </tr>
    </tfoot>
  );
}
