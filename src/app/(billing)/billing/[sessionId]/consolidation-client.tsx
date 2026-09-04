'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { BillSummary } from '@/components/billing/bill-summary';
import { ConsolidatedLineItem } from '@/components/billing/consolidated-line-item';
import { ReceiptSheet } from '@/components/billing/receipt-sheet';
import { Button } from '@/components/ui/button';
import { TextAreaField, TextField } from '@/components/ui/field';
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
} from '@/store/api/billing-api';
import { useCloseSessionMutation, useSessionDetailQuery } from '@/store/api/session-api';
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

  const bill = useConsolidateQuery(sessionId);
  const detail = useSessionDetailQuery(sessionId);

  const [exportBill, { isLoading: isExporting }] = useExportBillMutation();
  const [confirmExport] = useConfirmExportMutation();
  const [closeSession, { isLoading: isClosing }] = useCloseSessionMutation();

  const [lastExport, setLastExport] = useState<BillingExport | null>(null);
  const [posReference, setPosReference] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeNote, setCloseNote] = useState('');
  const [freeOpen, setFreeOpen] = useState(false);
  const [freeReason, setFreeReason] = useState('');
  const [printCount, setPrintCount] = useState(0);
  const [printedAt, setPrintedAt] = useState<string | null>(null);

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
      dispatch(
        toastPushed(
          result.export.exportStatus === EXPORT_STATUS.FAILED
            ? `Bill ${result.export.billNumber} created, but the POS hand-off failed. Enter it manually and confirm.`
            : `Bill ${result.export.billNumber} ready`,
          result.export.exportStatus === EXPORT_STATUS.FAILED ? 'error' : 'success',
        ),
      );
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not generate the bill'), 'error'));
    }
  }

  async function handleConfirmPos() {
    if (!lastExport) return;
    try {
      const updated = await confirmExport({
        id: lastExport._id,
        exportStatus: EXPORT_STATUS.CONFIRMED,
        ...(posReference.trim() ? { posReferenceId: posReference.trim() } : {}),
      }).unwrap();
      setLastExport(updated);
      dispatch(toastPushed('Recorded against the POS invoice', 'success'));
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not record that'), 'error'));
    }
  }

  async function handleClose() {
    try {
      await closeSession({
        sessionId,
        ...(lastExport ? { billingExportId: lastExport._id } : {}),
        ...(closeNote.trim() ? { note: closeNote.trim() } : {}),
        // A session held for manager review needs an explicit override, so the
        // discrepancy is acknowledged rather than absorbed.
        ...(bill.data?.requiresReview ? { force: true } : {}),
      }).unwrap();

      dispatch(toastPushed('Table closed and free', 'success'));
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

  return (
    <div className="flex flex-col gap-5">
      {/* Screen-invisible; `@media print` is the only thing that reveals it. */}
      <ReceiptSheet
        bill={data}
        billNumber={lastExport?.billNumber}
        printedAt={printedAt ?? data.openedAt}
        isReprint={printCount > 1}
      />

      <header className="print-hidden flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/billing" className="text-ink-muted text-sm hover:underline">
            ← Counter
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
            ⬇ CSV
          </Button>
          <Button variant="secondary" onClick={handlePrint}>
            🖨 Print
          </Button>
          {!isClosed ? (
            <Button isLoading={isExporting} onClick={() => void handleExport()}>
              Generate bill
            </Button>
          ) : null}
        </div>
      </header>

      {data.requiresReview ? (
        <p
          role="alert"
          className="rounded-card border-status-pending/40 bg-status-pending-soft text-status-pending-ink print-hidden border px-4 py-3 text-sm"
        >
          ⚠ Items were cancelled after the kitchen started them. This session is held for a manager
          to look at — closing it will be recorded as an override.
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
                <ConsolidatedLineItem key={line.productCode} line={line} />
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
                      key={`cancelled-${line.productCode}`}
                      line={line}
                      cancelled
                    />
                  ))}
                </>
              ) : null}
            </tbody>
          </table>
        </section>

        <aside className="flex flex-col gap-4">
          <BillSummary bill={data} />

          {lastExport ? (
            <ExportPanel
              record={lastExport}
              posReference={posReference}
              onPosReferenceChange={setPosReference}
              onConfirm={() => void handleConfirmPos()}
            />
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
        />
      </Modal>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title={`Close table ${data.tableCode}?`}
        description="This frees the table on the floor screen. Nothing is deleted — the whole session stays queryable."
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
        />
      </Modal>
    </div>
  );
}

interface ExportPanelProps {
  record: BillingExport;
  posReference: string;
  onPosReferenceChange: (value: string) => void;
  onConfirm: () => void;
}

/**
 * The verify step (§4.4 step 3).
 *
 * A failed hand-off never blocks printing or taking payment — it just needs to
 * be visible and retryable, because blocking a paying guest on POS uptime is
 * never the right trade.
 */
function ExportPanel({ record, posReference, onPosReferenceChange, onConfirm }: ExportPanelProps) {
  const failed = record.exportStatus === EXPORT_STATUS.FAILED;
  const confirmed = record.exportStatus === EXPORT_STATUS.CONFIRMED;

  return (
    <div
      className={cn(
        'rounded-card print-hidden flex flex-col gap-3 border-2 p-4',
        failed ? 'border-status-cancelled bg-status-cancelled-soft' : 'border-line bg-surface',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">Bill {record.billNumber}</p>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-bold uppercase',
            confirmed
              ? 'bg-status-ready-soft text-status-ready-ink'
              : failed
                ? 'bg-status-cancelled text-white'
                : 'bg-status-pending-soft text-status-pending-ink',
          )}
        >
          {record.exportStatus}
        </span>
      </div>

      {failed ? (
        <p className="text-status-cancelled-ink text-sm">
          The POS did not accept the hand-off{record.error ? `: ${record.error}` : ''}. Enter the
          codes above into the POS by hand, then record its invoice number here.
        </p>
      ) : null}

      {!confirmed ? (
        <>
          <TextField
            label="POS invoice number"
            value={posReference}
            onChange={(event) => onPosReferenceChange(event.target.value)}
            placeholder="e.g. INV-10482"
            hint="Ties our bill to the legacy system's own record."
          />
          <Button variant="secondary" onClick={onConfirm}>
            Mark as entered in POS
          </Button>
        </>
      ) : (
        <p className="text-ink-muted text-sm">
          Recorded against POS invoice{' '}
          <span className="text-ink font-semibold">{record.posReferenceId ?? '—'}</span>
        </p>
      )}
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
