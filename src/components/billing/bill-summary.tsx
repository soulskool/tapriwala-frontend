'use client';

import { ORDER_TYPE_LABEL } from '@/lib/constants';
import type { ConsolidatedBill } from '@/lib/types';
import { formatCurrency, formatDateTime } from '@/lib/utils';

/**
 * The totals block, and the sheet that actually gets printed.
 *
 * Everything here is computed by the server from the order rounds — no field
 * on this screen is typed by a human, which is the entire point.
 */
export function BillSummary({ bill }: { bill: ConsolidatedBill }) {
  return (
    <div className="rounded-card border-line bg-surface print-sheet border p-4">
      <div className="mb-3 hidden text-center print:block">
        <h2 className="text-xl font-bold">Tapriwala by Treatmeets</h2>
        <p className="text-sm">
          Table {bill.tableCode} · Session #{bill.sessionNumber}
        </p>
        <p className="text-sm">{formatDateTime(bill.openedAt)}</p>
      </div>

      <dl className="flex flex-col gap-2">
        {/* Named on every bill, single-type ones included: "which of these did
            they take away?" is asked at the counter often enough that leaving
            it off only when the answer is boring makes it easy to miss when it
            is not. */}
        <Row
          label="Order type"
          value={bill.orderTypes.map((type) => ORDER_TYPE_LABEL[type]).join(' + ') || '—'}
        />
        <Row label={`Subtotal (${bill.itemCount} items)`} value={formatCurrency(bill.subtotal)} />
        <Row label="Tax" value={formatCurrency(bill.tax)} />
        <div className="border-line mt-1 flex items-baseline justify-between border-t pt-3">
          <dt className="text-lg font-bold">Total</dt>
          <dd className="text-2xl font-black tabular-nums">{formatCurrency(bill.total)}</dd>
        </div>
      </dl>

      <p className="text-ink-muted mt-3 text-xs">
        {bill.roundCount} round{bill.roundCount === 1 ? '' : 's'} consolidated across this session.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
