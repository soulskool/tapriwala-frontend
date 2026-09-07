'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { IconBack, IconDownload, IconPrint, IconWarning } from '@/components/ui/icons';
import { BillSummary } from '@/components/billing/bill-summary';
import { ConsolidatedLineItem } from '@/components/billing/consolidated-line-item';
import { ReceiptSheet } from '@/components/billing/receipt-sheet';
import { Button } from '@/components/ui/button';
import { TextAreaField } from '@/components/ui/field';
import { ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/modal';
import { EXPORT_METHOD, EXPORT_STATUS, SESSION_STATUS } from '@/lib/constants';
import type { BillingExport } from '@/lib/types';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import { apiErrorMessage } from '@/store/api/base-query';
import {
  downloadBillCsv,
  useConfirmExportMutation,
  useConsolidateQuery,
  useExportBillMutation,
  useListExportsQuery,
} from '@/store/api/billing-api';
import { useCloseSessionMutation, useSessionDetailQuery } from '@/store/api/session-api';
import { useAppDispatch } from '@/store/hooks';
import { toastPushed } from '@/store/slices/ui-slice';

/**
 * A stable fingerprint of what is being charged for.
 *
 * Sorted, so the order the server happens to return lines in can never make an
 * unchanged bill look changed.
 */
function signature(
  lines: { productCode: string; quantity: number; unitPrice: number }[],
  total: number,
): string {
  return `${total}|${lines
    .map((line) => `${line.productCode}:${line.quantity}:${line.unitPrice}`)
    .sort()
    .join(',')}`;
}

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

  const bill = useConsolidateQuery(sessionId);
  const detail = useSessionDetailQuery(sessionId);

  /**
   * The bill already saved for this session, if any.
   *
   * Without this the bill number lived only in component state, so a reload —
   * or opening a closed table from the Billed list — printed a receipt reading
   * "BILL NO : (not generated)" for a bill that very much had been.
   */
  const saved = useListExportsQuery({ sessionId, limit: 1 });

  const [exportBill, { isLoading: isExporting }] = useExportBillMutation();
  const [confirmExport] = useConfirmExportMutation();
  const [closeSession, { isLoading: isClosing }] = useCloseSessionMutation();

  const [lastExport, setLastExport] = useState<BillingExport | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeNote, setCloseNote] = useState('');
  const [freeOpen, setFreeOpen] = useState(false);
  const [freeReason, setFreeReason] = useState('');
  const [printCount, setPrintCount] = useState(0);
  const [printedAt, setPrintedAt] = useState<string | null>(null);

  /** What this session has actually been billed as — fresh result, else stored. */
  const savedBill = lastExport ?? saved.data?.items[0] ?? null;

  /**
   * Has the table ordered since the bill was saved?
   *
   * A saved bill is frozen — that is the point of it — so a guest who adds a
   * coffee after "Generate bill" leaves the counter holding a bill for the old
   * total. Taking payment on that charges the wrong amount, which is the worst
   * bug this screen could have, so the answer to it is computed rather than
   * left to whoever is at the counter to notice.
   *
   * Compared on codes and quantities, not just the total: two items swapped for
   * two others at the same price is still a different bill.
   */
  const isStale = Boolean(
    savedBill &&
    bill.data &&
    signature(savedBill.lineItems, savedBill.total) !== signature(bill.data.lines, bill.data.total),
  );

  /**
   * Prints the 80mm receipt.
   *
   * The timestamp is frozen at the moment of printing rather than read inside
   * the component: a re-render mid-print would otherwise put a different time
   * on the paper than the one the guest was shown.
   */
  function handlePrint() {
    setPrintedAt(new Date().toISOString());
    setPrintCount((count) => count + 1);
    // Let React paint the frozen timestamp before the browser freezes the page.
    requestAnimationFrame(() => window.print());
  }

  async function handleExport() {
    try {
      const result = await exportBill({
        sessionId,
        // Phase 1 ships Option D: the screen shows exact codes and quantities
        // for one fast manual pass. Swapping this to `api` or `csv` is the
        // whole of the Phase 2 change on this screen.
        method: EXPORT_METHOD.MANUAL_DISPLAY,
      }).unwrap();

      setLastExport(result.export);
      dispatch(toastPushed(`Bill ${result.export.billNumber} saved`, 'success'));
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not generate the bill'), 'error'));
    }
  }

  /**
   * Payment taken: save the bill, mark it paid, free the table.
   *
   * There is no POS to hand anything to — this portal *is* the bill — so all
   * three happen on one press rather than making the counter remember to
   * generate first. Closing without generating used to leave a table with no
   * saved copy at all, which is the one outcome you can never reconstruct
   * afterwards.
   *
   * `confirmed` no longer means "entered in the legacy POS", because there is
   * no legacy POS to enter it into. It means the counter took the money and
   * closed the table, and `confirmedAt` is when. The field and its endpoint are
   * left alone so a real POS integration can reclaim the original meaning.
   */
  async function handleClose() {
    try {
      // A stale bill is discarded rather than paid: the guest ordered after it
      // was saved, so a new one is generated for what they actually had. The
      // old bill keeps its number and stays in Billed — nothing is deleted —
      // it simply never becomes the one marked paid.
      let record = isStale ? null : savedBill;

      // An empty table has nothing to bill — the server refuses that, and
      // rightly. It closes with no export, exactly as it always did.
      if (!record && (bill.data?.lines.length ?? 0) > 0) {
        const result = await exportBill({
          sessionId,
          method: EXPORT_METHOD.MANUAL_DISPLAY,
        }).unwrap();
        record = result.export;
        setLastExport(result.export);
      }

      /*
       * Close first, mark paid second — never the other way round.
       *
       * The server refuses to close a table the kitchen has not finished, so
       * this call really can fail. Confirming first meant a failed close left
       * behind a bill stamped *paid* against a table that was still open and
       * still owed food. Ordered this way the worst case is a bill saved but
       * not settled, which reads correctly on every screen and is fixed by
       * pressing the button again.
       */
      await closeSession({
        sessionId,
        ...(record ? { billingExportId: record._id } : {}),
        ...(closeNote.trim() ? { note: closeNote.trim() } : {}),
        // A session held for manager review needs an explicit override, so the
        // discrepancy is acknowledged rather than absorbed.
        ...(bill.data?.requiresReview ? { force: true } : {}),
      }).unwrap();

      if (record && record.exportStatus !== EXPORT_STATUS.CONFIRMED) {
        record = await confirmExport({
          id: record._id,
          exportStatus: EXPORT_STATUS.CONFIRMED,
          ...(closeNote.trim() ? { note: closeNote.trim() } : {}),
        }).unwrap();
        setLastExport(record);
      }

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
   *
   * Closes with `force` and no export id, which is what makes the backend write
   * off whatever the kitchen still had open and clear the ticket off the board.
   */
  async function handleFree() {
    if (!freeReason.trim()) return;
    try {
      await closeSession({
        sessionId,
        force: true,
        note: `Freed without billing — ${freeReason.trim()}`,
      }).unwrap();

      dispatch(
        toastPushed(`${bill.data?.tableCode ?? 'Table'} is free — nothing charged`, 'success'),
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
  const isClosed = data.status === SESSION_STATUS.CLOSED;

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
      {/* Screen-invisible; `@media print` is the only thing that reveals it. */}
      <ReceiptSheet
        bill={data}
        billNumber={isStale ? undefined : savedBill?.billNumber}
        printedAt={printedAt ?? data.openedAt}
        isReprint={printCount > 1}
      />

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
            variant="secondary"
            onClick={() =>
              void downloadBillCsv(sessionId, `bill-${data.tableCode}-${data.sessionNumber}.csv`)
            }
          >
            <IconDownload aria-hidden className="mr-1.5 inline size-4" /> CSV
          </Button>
          <Button variant="secondary" onClick={handlePrint}>
            <IconPrint aria-hidden className="mr-1.5 inline size-4" /> Print
          </Button>
          {/*
           * Optional now, not a prerequisite: taking payment saves the bill by
           * itself. This is for the counter who wants the number in hand — to
           * print it and hand it over — before the guest has actually paid.
           */}
          {!isClosed && (!savedBill || isStale) ? (
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
          kitchen started them. This session is held for a manager to look at — closing it will be
          recorded as an override.
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
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
                      Cancelled — not billed, kept for the record
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
          <BillSummary bill={data} />

          {savedBill ? (
            <ExportPanel record={savedBill} isStale={isStale} onPrint={handlePrint} />
          ) : null}

          {!isClosed ? (
            <div className="print-hidden flex flex-col gap-2">
              <Button variant="success" size="lg" fullWidth onClick={() => setCloseOpen(true)}>
                Payment taken — close table
              </Button>
              <Button variant="danger" fullWidth onClick={() => setFreeOpen(true)}>
                Free table without charging
              </Button>
            </div>
          ) : (
            <p className="rounded-card border-line bg-surface text-ink-muted print-hidden border px-4 py-3 text-center text-sm">
              This session is closed. The table is free.
            </p>
          )}

          <SessionRoundsSummary
            roundCount={data.roundCount}
            openedAt={data.openedAt}
            hasDetail={Boolean(detail.data)}
          />
        </aside>
      </div>

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
          be collected. A reason is required — it goes on the audit trail with your name.
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
        description="The bill is saved to Billed with its own number, marked paid, and the table goes free. Nothing is deleted — the whole session stays queryable."
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
          Total collected: <span className="tabular-nums">{formatCurrency(data.total)}</span>
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
            ? `This table has ordered since bill ${record.billNumber} was saved — it is for ${formatCurrency(record.total)}, the table now owes more. Taking payment issues a fresh bill for the correct amount; press “Update bill” if you want the new number first.`
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
