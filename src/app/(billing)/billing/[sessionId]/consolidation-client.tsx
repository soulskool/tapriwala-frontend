'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { IconBack, IconBill, IconDownload, IconPrint, IconWarning } from '@/components/ui/icons';
import { BillSummary } from '@/components/billing/bill-summary';
import { CheckoutModal } from '@/components/billing/checkout-modal';
import { ConsolidatedLineItem } from '@/components/billing/consolidated-line-item';
import { ReceiptSheet, type ReceiptSheetProps } from '@/components/billing/receipt-sheet';
import { Button } from '@/components/ui/button';
import { TextAreaField } from '@/components/ui/field';
import { ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/modal';
import { useCanWrite } from '@/hooks/use-can-write';
import { receiptFor, useTableBill } from '@/hooks/use-table-bill';
import { EXPORT_STATUS, SESSION_STATUS } from '@/lib/constants';
import { countPrint, printKey } from '@/lib/print/print-count';
import { printDocument } from '@/lib/print/print-document';
import type { BillingExport } from '@/lib/types';
import { cn, formatBillTotal, formatCurrency, formatDateTime } from '@/lib/utils';
import { apiErrorMessage } from '@/store/api/base-query';
import { downloadBillCsv } from '@/store/api/billing-api';
import { useSessionDetailQuery } from '@/store/api/session-api';
import { useAppDispatch } from '@/store/hooks';
import { toastPushed } from '@/store/slices/ui-slice';

/**
 * The counter screen (§4.4).
 *
 * Every item this table ordered, across every round, merged by product code —
 * computed server-side from the order rounds with nothing typed by hand. This
 * is what removes the search-by-name pass the biller does today.
 */
export function ConsolidationClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const table = useTableBill(sessionId);
  const { bill, savedBill, isStale, isExporting, isClosing } = table;
  const detail = useSessionDetailQuery(sessionId);

  // A view-only admin reads, downloads and prints the bill; it never saves,
  // settles or frees one.
  const canAct = useCanWrite();

  const [closeOpen, setCloseOpen] = useState(false);
  const [closeNote, setCloseNote] = useState('');
  const [freeOpen, setFreeOpen] = useState(false);
  const [freeReason, setFreeReason] = useState('');
  /** The one-tap checkout pop-up — the fast path beside the buttons below. */
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [printCount, setPrintCount] = useState(0);
  const [printedAt, setPrintedAt] = useState<string | null>(null);

  /**
   * Prints the 80mm receipt.
   *
   * The timestamp is frozen at the moment of printing rather than read inside
   * the component: a re-render mid-print would otherwise put a different time
   * on the paper than the one the guest was shown.
   *
   * `printDocument` decides how: this device's System mode runs the old path
   * (the hidden sheet + `window.print()`), a direct mode sends the same
   * receipt to the printer as ESC/POS. Both count as a print, so the second
   * one is a DUPLICATE either way — and the count is shared with the checkout
   * modal, so a bill printed in one and again in the other is a DUPLICATE too.
   */
  function handlePrint(receipt: Pick<ReceiptSheetProps, 'bill' | 'billNumber'>) {
    const now = new Date().toISOString();
    const count = countPrint(printKey(sessionId, receipt.billNumber));
    setPrintedAt(now);
    setPrintCount(count);
    printDocument(
      {
        kind: 'receipt',
        receipt: {
          ...receipt,
          printedAt: now,
          isReprint: count > 1,
          settled: table.isClosed,
        },
      },
      () =>
        // Let React paint the frozen timestamp before the browser freezes the page.
        requestAnimationFrame(() => window.print()),
    );
  }

  async function handleExport() {
    try {
      const record = await table.generate();
      dispatch(toastPushed(`Bill ${record.billNumber} saved`, 'success'));
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not generate the bill'), 'error'));
    }
  }

  /** Payment taken: save the bill, mark it paid, free the table. See `settle`. */
  async function handleClose() {
    try {
      const record = await table.settle({ note: closeNote });
      dispatch(
        toastPushed(
          record ? `Bill ${record.billNumber} saved · table closed` : 'Table closed and free',
          'success',
        ),
      );
      router.push('/billing');
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not close the session'), 'error'));
    }
  }

  /**
   * Frees the table without charging for it.
   *
   * The counter needs this on the same screen as the bill, not only on the
   * floor: the moment you find out an order is fake, or that a group walked
   * out, is the moment you are staring at their bill wondering why nobody is
   * paying it. Deliberately kept separate from "Payment taken" so that
   * "nobody paid" can never be recorded as revenue.
   */
  async function handleFree() {
    if (!freeReason.trim()) return;
    try {
      await table.free(freeReason);
      dispatch(
        toastPushed(`${bill.data?.tableCode ?? 'Table'} is free, nothing charged`, 'success'),
      );
      router.push('/billing');
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not free the table'), 'error'));
    }
  }

  if (bill.isLoading) return <LoadingBlock label="Consolidating…" />;
  if (bill.isError || !bill.data) {
    return (
      <ErrorState
        message={apiErrorMessage(bill.error, 'Could not build this bill')}
        onRetry={() => void bill.refetch()}
      />
    );
  }

  const data = bill.data;

  /**
   * The money as charged.
   *
   * Once a bill is saved its total is the frozen one, not a fresh rounding of
   * the live lines. Today the two are identical; for a bill saved before
   * rounding began they are not, and a reprint must say what the guest was
   * actually charged — ₹451.50, not ₹452.
   */
  const charged = receiptFor(data, table.current).bill;

  const isClosed = data.status === SESSION_STATUS.CLOSED;

  /** The paper as it stands — the hidden sheet below renders the same two props. */
  const printReceipt = () =>
    handlePrint({ bill: charged, billNumber: isStale ? undefined : savedBill?.billNumber });

  /**
   * The table both ate here and carried something out.
   *
   * Drives the per-line badge and the marker on the paper. Computed once from
   * the server's summary rather than by scanning the lines, so screen and
   * receipt can never disagree about whether this bill is mixed.
   */
  const isMixedOrderType = data.orderTypes.length > 1;

  return (
    <div className="flex flex-col gap-5">
      {/* Screen-invisible; `@media print` is the only thing that reveals it.
          Unmounted while the checkout modal is open: it prints its own sheet,
          and two mounted sheets would put two bills on one strip of paper. */}
      {checkoutOpen ? null : (
        <ReceiptSheet
          bill={charged}
          billNumber={isStale ? undefined : savedBill?.billNumber}
          printedAt={printedAt ?? data.openedAt}
          isReprint={printCount > 1}
          settled={isClosed}
        />
      )}

      <header className="print-hidden flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/billing" className="text-ink-muted text-sm hover:underline">
            <IconBack aria-hidden className="mr-1 inline size-4" /> Counter
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Table {data.tableCode}</h1>
          <p className="text-ink-muted text-sm">
            Session #{data.sessionNumber} · opened {formatDateTime(data.openedAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setCheckoutOpen(true)}
            leadingIcon={<IconBill aria-hidden className="size-4" />}
          >
            {isClosed ? 'Reprint' : canAct ? 'Checkout' : 'Preview bill'}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              void downloadBillCsv(sessionId, `bill-${data.tableCode}-${data.sessionNumber}.csv`)
            }
          >
            <IconDownload aria-hidden className="mr-1.5 inline size-4" /> CSV
          </Button>
          <Button variant="secondary" onClick={printReceipt}>
            <IconPrint aria-hidden className="mr-1.5 inline size-4" /> Print
          </Button>
          {/*
           * Optional now, not a prerequisite: taking payment saves the bill by
           * itself. This is for the counter who wants the number in hand — to
           * print it and hand it over — before the guest has actually paid.
           */}
          {canAct && !isClosed && (!savedBill || isStale) ? (
            <Button
              variant={isStale ? 'primary' : 'secondary'}
              isLoading={isExporting}
              onClick={() => void handleExport()}
            >
              {isStale ? 'Update bill' : 'Generate bill'}
            </Button>
          ) : null}
        </div>
      </header>

      {data.requiresReview ? (
        <p
          role="alert"
          className="rounded-card border-status-pending/40 bg-status-pending-soft text-status-pending-ink print-hidden border px-4 py-3 text-sm"
        >
          <IconWarning aria-hidden className="mr-1 inline size-4" /> Items were cancelled after the
          kitchen started them. This session is held for a manager to look at. Closing it will be
          recorded as an override.
        </p>
      ) : null}

      {/* `grid-cols-1` is deliberate: without a mobile template the implicit
       `auto` track sizes to its content's max-content and inflates the whole
       page sideways. `repeat(1, minmax(0,1fr))` gives it a zero floor. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_22rem]">
        <section
          aria-label="Consolidated items"
          className="rounded-card border-line bg-surface print-sheet overflow-x-auto border"
        >
          <table className="w-full min-w-[36rem] text-left">
            <thead className="border-line bg-surface-muted text-ink-muted border-b text-sm">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Code
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Item
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Qty
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Rate
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                // Keyed on code *and* type: a mixed bill has the same code on
                // two rows, and a bare code would collide.
                <ConsolidatedLineItem
                  key={`${line.productCode}-${line.orderType}`}
                  line={line}
                  showOrderType={isMixedOrderType}
                />
              ))}

              {data.cancelledLines.length > 0 ? (
                <>
                  <tr className="print-hidden">
                    <td
                      colSpan={5}
                      className="bg-surface-muted text-ink-muted px-3 py-1.5 text-xs font-semibold tracking-wide uppercase"
                    >
                      Cancelled: not billed, kept for the record
                    </td>
                  </tr>
                  {data.cancelledLines.map((line) => (
                    <ConsolidatedLineItem
                      key={`cancelled-${line.productCode}-${line.orderType}`}
                      line={line}
                      cancelled
                      showOrderType={isMixedOrderType}
                    />
                  ))}
                </>
              ) : null}
            </tbody>
          </table>
        </section>

        <aside className="flex flex-col gap-4">
          <BillSummary bill={charged} />

          {savedBill ? (
            <ExportPanel record={savedBill} isStale={isStale} onPrint={printReceipt} />
          ) : null}

          {isClosed ? null : !canAct ? (
            <p className="rounded-card border-line bg-surface text-ink-muted print-hidden border px-4 py-3 text-center text-sm">
              This table is still open. Settling it is done at the counter.
            </p>
          ) : (
            <div className="print-hidden flex flex-col gap-2">
              {/* The fast path: print + payment in one pop-up. The buttons
                  below are the original step-by-step flow, kept as it was. */}
              <Button
                size="lg"
                fullWidth
                onClick={() => setCheckoutOpen(true)}
                leadingIcon={<IconBill aria-hidden className="size-5" />}
              >
                Checkout · print &amp; pay
              </Button>
              <Button variant="success" size="lg" fullWidth onClick={() => setCloseOpen(true)}>
                Payment taken, close table
              </Button>
              <Button variant="danger-outline" fullWidth onClick={() => setFreeOpen(true)}>
                Free table without charging
              </Button>
            </div>
          )}

          {isClosed ? (
            <p className="rounded-card border-line bg-surface text-ink-muted print-hidden border px-4 py-3 text-center text-sm">
              This session is closed. The table is free.
            </p>
          ) : null}

          <SessionRoundsSummary
            roundCount={data.roundCount}
            openedAt={data.openedAt}
            hasDetail={Boolean(detail.data)}
          />
        </aside>
      </div>

      <CheckoutModal
        sessionId={sessionId}
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onSettled={() => router.push('/billing')}
      />

      <Modal
        open={freeOpen}
        onClose={() => setFreeOpen(false)}
        title={`Free ${data.tableCode} without charging?`}
        description="Nothing is billed and nothing is deleted. Anything the kitchen has not finished is written off, and the ticket comes off the board."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFreeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isClosing}
              disabled={!freeReason.trim()}
              onClick={() => void handleFree()}
            >
              Free the table
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm">
          <span className="font-semibold tabular-nums">{formatCurrency(data.total)}</span> will not
          be collected. A reason is required.
        </p>
        <TextAreaField
          label="Reason"
          value={freeReason}
          onChange={(event) => setFreeReason(event.target.value)}
          placeholder="e.g. order placed from a copied link, nobody at the table"
          required
          maxLength={260}
        />
      </Modal>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title={`Close table ${data.tableCode}?`}
        description="The bill is saved to Billed with its own number, marked paid, and the table goes free. Nothing is deleted. The whole session stays queryable."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseOpen(false)}>
              Not yet
            </Button>
            <Button variant="success" isLoading={isClosing} onClick={() => void handleClose()}>
              Close table
            </Button>
          </>
        }
      >
        <p className="mb-3 text-lg font-semibold">
          Total collected: <span className="tabular-nums">{formatBillTotal(charged.total)}</span>
        </p>
        <TextAreaField
          label="Note (optional)"
          value={closeNote}
          onChange={(event) => setCloseNote(event.target.value)}
          placeholder="e.g. paid by card"
          maxLength={300}
        />
      </Modal>
    </div>
  );
}

/**
 * The saved bill.
 *
 * All this needs to say is "a permanent copy exists, here is its number, and
 * here is whether it has been paid". There is no POS invoice number to collect
 * and nothing to confirm by hand — the portal issues the only bill there is, so
 * asking the counter to reconcile it against a second system would be asking
 * about a system that does not exist.
 */
function ExportPanel({
  record,
  isStale,
  onPrint,
}: {
  record: BillingExport;
  /** The table has ordered since this bill was saved. */
  isStale: boolean;
  onPrint: () => void;
}) {
  const paid = record.exportStatus === EXPORT_STATUS.CONFIRMED;
  const failed = record.exportStatus === EXPORT_STATUS.FAILED;

  return (
    <div
      className={cn(
        'rounded-card print-hidden flex flex-col gap-3 border-2 p-4',
        failed
          ? 'border-status-cancelled bg-status-cancelled-soft'
          : isStale
            ? 'border-status-pending bg-status-pending-soft'
            : 'border-line bg-surface',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">Bill {record.billNumber}</p>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-bold uppercase',
            paid
              ? 'bg-status-ready-soft text-status-ready-ink'
              : failed
                ? 'bg-status-cancelled text-white'
                : 'bg-status-pending-soft text-status-pending-ink',
          )}
        >
          {paid ? 'Paid' : failed ? 'Failed' : isStale ? 'Out of date' : 'Saved'}
        </span>
      </div>

      {failed && record.lastError ? (
        <p className="text-status-cancelled-ink text-sm">{record.lastError}</p>
      ) : null}

      <p className={cn('text-sm', isStale ? 'text-status-pending-ink' : 'text-ink-muted')}>
        {paid
          ? `Paid and closed ${formatDateTime(record.confirmedAt ?? record.generatedAt)}.`
          : isStale
            ? `This table has ordered since bill ${record.billNumber} was saved. It is for ${formatCurrency(record.total)}, and the table now owes more. Taking payment issues a fresh bill for the correct amount; press “Update bill” if you want the new number first.`
            : 'Saved to Billed. Taking payment will mark it paid and free the table.'}
      </p>

      {!isStale ? (
        <Button variant="secondary" fullWidth onClick={onPrint}>
          <IconPrint aria-hidden className="mr-1.5 inline size-4" /> Print this bill
        </Button>
      ) : null}
    </div>
  );
}

function SessionRoundsSummary({
  roundCount,
  openedAt,
  hasDetail,
}: {
  roundCount: number;
  openedAt: string;
  hasDetail: boolean;
}) {
  if (!hasDetail) return null;

  return (
    <div className="rounded-card border-line bg-surface text-ink-muted print-hidden border px-4 py-3 text-sm">
      <p>
        {roundCount} round{roundCount === 1 ? '' : 's'} since {formatDateTime(openedAt)}. Full
        per-round history stays queryable after closing.
      </p>
    </div>
  );
}
