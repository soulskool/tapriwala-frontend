'use client';

import { useState } from 'react';

import type { ReceiptSheetProps } from '@/components/billing/receipt-sheet';
import { EXPORT_METHOD, EXPORT_STATUS, SESSION_STATUS } from '@/lib/constants';
import { formatBillTotal } from '@/lib/utils';
import type { BillingExport, ConsolidatedBill } from '@/lib/types';
import {
  useConfirmExportMutation,
  useConsolidateQuery,
  useExportBillMutation,
  useListExportsQuery,
} from '@/store/api/billing-api';
import { useCloseSessionMutation } from '@/store/api/session-api';

/**
 * A stable fingerprint of what is being charged for.
 *
 * Sorted, so the order the server happens to return lines in can never make an
 * unchanged bill look changed.
 *
 * Built on subtotal + tax — the exact figure, in paise — and not on `total`.
 * `total` is rounded to the rupee now, but a bill saved before rounding began
 * kept its paisa total, so comparing totals would brand every such bill "out
 * of date" against the very lines it was saved from.
 */
function signature(
  lines: { productCode: string; quantity: number; unitPrice: number }[],
  subtotal: number,
  tax: number,
): string {
  return `${Math.round((subtotal + tax) * 100)}|${lines
    .map((line) => `${line.productCode}:${line.quantity}:${line.unitPrice}`)
    .sort()
    .join(',')}`;
}

/**
 * Do two reads of a table's bill charge for the same food?
 *
 * The cached bill is not always fresh: a kitchen tick, a cancel or a moved
 * bill does not re-read it. Anything about to charge or print compares the
 * screen against a fresh read with this first.
 */
export function sameBill(a: ConsolidatedBill, b: ConsolidatedBill): boolean {
  return signature(a.lines, a.subtotal, a.tax) === signature(b.lines, b.subtotal, b.tax);
}

/** The server's refusal shape, so every caller's `apiErrorMessage` reads it. */
function refusal(message: string): unknown {
  return {
    status: 422,
    data: { success: false, error: { code: 'INVALID_STATE', message, details: [] } },
  };
}

/** The newer of two saved bills. Bill numbers only ever go up. */
function newest(a: BillingExport | null, b: BillingExport | null): BillingExport | null {
  if (!a) return b;
  if (!b) return a;
  return a.billNumber >= b.billNumber ? a : b;
}

/**
 * The paper for a bill.
 *
 * Once a bill is saved its total is the frozen one, not a fresh rounding of the
 * live lines. Today the two are identical; for a bill saved before rounding
 * began they are not, and a reprint must say what the guest was actually
 * charged — ₹451.50, not ₹452.
 */
export function receiptFor(
  bill: ConsolidatedBill,
  record: BillingExport | null,
): Pick<ReceiptSheetProps, 'billNumber'> & { bill: ConsolidatedBill } {
  return record
    ? {
        bill: { ...bill, total: record.total, roundOff: record.roundOff ?? 0 },
        billNumber: record.billNumber,
      }
    : { bill, billNumber: undefined };
}

/**
 * One table's bill and everything the counter can do to it.
 *
 * Shared by the bill page (the original buttons) and the checkout modal (one
 * pop-up for print + payment), so the two can never disagree about which bill
 * is current or in what order a table is closed. Pass `null` to keep it idle —
 * the counter's list mounts the modal before anyone has picked a table.
 *
 * Every action throws on failure; the caller decides what to tell the counter.
 */
export function useTableBill(sessionId: string | null) {
  const skip = !sessionId;
  const id = sessionId ?? '';

  const bill = useConsolidateQuery(id, { skip });

  /**
   * The bill already saved for this session, if any.
   *
   * Without this the bill number lived only in component state, so a reload —
   * or opening a closed table from the Billed list — printed a receipt reading
   * "BILL NO : (not generated)" for a bill that very much had been.
   */
  const saved = useListExportsQuery({ sessionId: id, limit: 1 }, { skip });

  const [exportBill, { isLoading: isExporting }] = useExportBillMutation();
  const [confirmExport, { isLoading: isConfirming }] = useConfirmExportMutation();
  const [closeSession, { isLoading: isClosing }] = useCloseSessionMutation();

  /** The bill this screen just saved — ahead of the list until it refetches. */
  const [lastExport, setLastExport] = useState<BillingExport | null>(null);

  /**
   * What this session has actually been billed as.
   *
   * The newer of this screen's own result and the stored one, rather than
   * "own result first": the page and the modal each hold one, and a number
   * made in the modal must not be shadowed by an older one the page made.
   */
  const savedBill = newest(
    lastExport?.sessionId === sessionId ? lastExport : null,
    saved.data?.items[0] ?? null,
  );

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
    signature(savedBill.lineItems, savedBill.subtotal, savedBill.tax) !==
      signature(bill.data.lines, bill.data.subtotal, bill.data.tax),
  );

  /** The saved bill that still matches the table, if there is one. */
  const current = isStale ? null : savedBill;

  const isClosed = bill.data?.status === SESSION_STATUS.CLOSED;
  const hasLines = (bill.data?.lines.length ?? 0) > 0;

  async function generate(): Promise<BillingExport> {
    const result = await exportBill({
      sessionId: id,
      // Phase 1 ships Option D: the screen shows exact codes and quantities
      // for one fast manual pass. Swapping this to `api` or `csv` is the
      // whole of the Phase 2 change on this screen.
      method: EXPORT_METHOD.MANUAL_DISPLAY,
    }).unwrap();
    setLastExport(result.export);
    return result.export;
  }

  /**
   * The bill to print or charge: the saved one if it still matches, else a
   * fresh number.
   *
   * A stale bill is discarded rather than reused: the guest ordered after it
   * was saved, so a new one is generated for what they actually had. The old
   * bill keeps its number and stays in Billed — nothing is deleted — it simply
   * never becomes the one marked paid.
   *
   * An empty table has nothing to bill — the server refuses that, and rightly
   * — so it comes back null rather than as an error. That includes a table
   * whose every item was cancelled after its bill was made: the old bill is
   * stale, and charging it would book food nobody had.
   *
   * A closed table is only ever reprinted, so it gets the bill it closed on.
   */
  async function ensureCurrent(): Promise<BillingExport | null> {
    if (current) return current;
    if (isClosed) return savedBill;
    if (!hasLines) return null;
    return generate();
  }

  /**
   * Is what is on screen still what the server holds?
   *
   * The cached bill can be behind: a kitchen tick, a cancel, or a bill moved
   * onto this table does not re-read it. Charging or printing from a stale
   * copy would put the wrong amount on the paper or in Sales, so every press
   * that does either asks first, from a fresh read. Returns what stops it, in
   * the counter's words, or null to go ahead. Asked before a number is made,
   * so a refusal never leaves a stray bill behind.
   *
   * `kitchen` adds the close's own rule: the server will not free a table the
   * kitchen is still cooking for. Print only skips it — a guest may want to
   * see the bill while the last tea is on its way.
   */
  async function checkFresh(options: { kitchen: boolean }): Promise<string | null> {
    const fresh = await bill.refetch().unwrap();
    if (fresh.status === SESSION_STATUS.CLOSED) {
      return `${fresh.tableCode} is already closed. It was settled on another screen.`;
    }
    const left = fresh.kitchenPendingCount ?? 0;
    if (options.kitchen && left > 0) {
      return `${fresh.tableCode} cannot close yet: the kitchen has ${left} item${left === 1 ? '' : 's'} not finished. Nothing was charged or printed. Mark them served (or cancel them), then press again.`;
    }
    if (bill.data && !sameBill(bill.data, fresh)) {
      return `The bill just changed. It now comes to ${formatBillTotal(fresh.total)}. Check it and press again.`;
    }
    return null;
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
   *
   * Pass `record` when the caller has just made the number itself (to print it
   * inside the tap), so it is not made twice.
   */
  async function settle(options: {
    note?: string;
    record?: BillingExport | null;
    /** The caller already ran `checkFresh({ kitchen: true })` for this press. */
    checked?: boolean;
  }): Promise<BillingExport | null> {
    const note = options.note?.trim() ?? '';
    if (!options.checked) {
      const problem = await checkFresh({ kitchen: true });
      if (problem) throw refusal(problem);
    }
    let record = options.record !== undefined ? options.record : await ensureCurrent();

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
      sessionId: id,
      ...(record ? { billingExportId: record._id } : {}),
      ...(note ? { note } : {}),
      // A session held for manager review needs an explicit override, so the
      // discrepancy is acknowledged rather than absorbed.
      ...(bill.data?.requiresReview ? { force: true } : {}),
    }).unwrap();

    if (record && record.exportStatus !== EXPORT_STATUS.CONFIRMED) {
      record = await confirmExport({
        id: record._id,
        exportStatus: EXPORT_STATUS.CONFIRMED,
        ...(note ? { note } : {}),
      }).unwrap();
      setLastExport(record);
    }

    return record;
  }

  /**
   * Frees the table without charging for it.
   *
   * Closes with `force` and no export id, which is what makes the backend write
   * off whatever the kitchen still had open and clear the ticket off the board.
   * Deliberately separate from `settle` so that "nobody paid" can never be
   * recorded as revenue.
   */
  async function free(reason: string): Promise<void> {
    await closeSession({
      sessionId: id,
      force: true,
      note: `Freed without billing: ${reason.trim()}`,
    }).unwrap();
  }

  return {
    bill,
    savedBill,
    current,
    isStale,
    isClosed,
    hasLines,
    isExporting,
    isBusy: isExporting || isClosing || isConfirming,
    isClosing,
    generate,
    ensureCurrent,
    checkFresh,
    settle,
    free,
  };
}
