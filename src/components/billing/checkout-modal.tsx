'use client';

import Link from 'next/link';
import { useEffect, useReducer, useState, type ReactNode } from 'react';

import {
  RECEIPT_WIDTH,
  ReceiptSheet,
  UpiQrPicture,
  buildReceiptText,
  scanAndPay,
  type ReceiptSheetProps,
} from '@/components/billing/receipt-sheet';
import { Button } from '@/components/ui/button';
import { TextAreaField } from '@/components/ui/field';
import { ErrorState, LoadingBlock, Spinner } from '@/components/ui/feedback';
import {
  IconBill,
  IconBillMoved,
  IconCard,
  IconCash,
  IconCheck,
  IconFreeTable,
  IconInfo,
  IconPrint,
  IconRefresh,
  IconUpi,
  IconWarning,
} from '@/components/ui/icons';
import { Modal } from '@/components/ui/modal';
import { receiptFor, useTableBill } from '@/hooks/use-table-bill';
import { useCanWrite } from '@/hooks/use-can-write';
import { usePrinterSettings } from '@/hooks/use-printer';
import { EXPORT_STATUS } from '@/lib/constants';
import { countPrint, peekPrintCount, printKey } from '@/lib/print/print-count';
import { printDocument } from '@/lib/print/print-document';
import { PRINT_MODE, readPrinterSettings, upiQrMode } from '@/lib/print/print-settings';
import { receiptUpiQr, type UpiQrMode } from '@/lib/print/upi-qr';
import type { BillingExport } from '@/lib/types';
import { cn, formatBillTotal } from '@/lib/utils';
import { apiErrorMessage } from '@/store/api/base-query';
import { useAppDispatch } from '@/store/hooks';
import { toastPushed } from '@/store/slices/ui-slice';

/**
 * Checkout: the bill, the paper and the payment in one pop-up.
 *
 * The counter's old routine was three separate presses — Generate bill,
 * Print, Payment taken — and staff skipped steps: a bill printed with no
 * number, or a paid table freed instead of settled, both of which leave the
 * money out of Sales. Here the number is made by the first print, and the one
 * big button prints, marks paid and frees the table together.
 *
 * The bill page keeps its original buttons; this is the fast path beside
 * them, and the counter's list opens it without leaving the list.
 */
export function CheckoutModal({
  sessionId,
  open,
  onClose,
  onSettled,
}: {
  /** Null while no table is picked — renders nothing. */
  sessionId: string | null;
  open: boolean;
  onClose: () => void;
  /** After the table is closed, paid or freed. Defaults to `onClose`. */
  onSettled?: () => void;
}) {
  /*
   * Mounted only while open, so every opening starts clean — no reason left
   * typed from the last table, no payment method carried over — and no
   * queries run for a table nobody is looking at.
   */
  if (!open || !sessionId) return null;
  return (
    <CheckoutDialog sessionId={sessionId} onClose={onClose} onSettled={onSettled ?? onClose} />
  );
}

type Step = 'main' | 'free' | 'done';
/**
 * What is in flight, and for which button — each one shows its own spinner.
 * `pay-*` is the big button's three stages; `print-*` is Print only's two.
 */
type Busy =
  | 'pay-check'
  | 'pay-number'
  | 'pay-print'
  | 'pay-settle'
  | 'print-number'
  | 'print'
  | 'update'
  | 'paid-check'
  | 'paid'
  | 'free'
  | null;

const METHODS = [
  { id: 'Cash', icon: IconCash },
  { id: 'UPI', icon: IconUpi },
  { id: 'Card', icon: IconCard },
] as const;
type Method = (typeof METHODS)[number]['id'];

/**
 * Why a table is freed. A list, not a blank box: the audit found reasons
 * like "a", "p" and "." against paid tables, and none of them say anything.
 */
const FREE_REASONS = [
  'Table shifted',
  'Guest left without paying',
  'Wrong or test order',
  'Bill made by mistake',
  'Other',
] as const;
type FreeReason = (typeof FREE_REASONS)[number];

/**
 * Is the tap that started this still "live"?
 *
 * RawBT opens through an app link and Bluetooth's chooser through
 * `requestDevice`, and the browser allows both only for a few seconds after
 * a tap. Making the number is a network call in between, so on a slow line
 * the tap can expire — then the bill is ready but the print would be refused.
 * System print has no such limit. A browser that cannot say is trusted.
 */
function tapStillLive(): boolean {
  if (readPrinterSettings().mode === PRINT_MODE.SYSTEM) return true;
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } })
    .userActivation;
  return activation ? activation.isActive : true;
}

function CheckoutDialog({
  sessionId,
  onClose,
  onSettled,
}: {
  sessionId: string;
  onClose: () => void;
  onSettled: () => void;
}) {
  const dispatch = useAppDispatch();
  const canAct = useCanWrite();
  const table = useTableBill(sessionId);
  const { bill, current, savedBill, isStale, isClosed, hasLines } = table;

  const [step, setStep] = useState<Step>('main');
  const [busy, setBusy] = useState<Busy>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [freeReason, setFreeReason] = useState<FreeReason | null>(null);
  const [freeDetail, setFreeDetail] = useState('');
  /**
   * What happened, said inside the pop-up.
   *
   * Not a toast: the dialog sits in the browser's top layer, above the toast
   * stack, so an error toast would land behind it where nobody can read it.
   */
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  /** A number was made but the tap expired before it could print. */
  const [needsTap, setNeedsTap] = useState(false);
  /** The closed bill, for the "paid" screen. */
  const [settled, setSettled] = useState<{
    record: BillingExport | null;
    printed: boolean;
  } | null>(null);
  /** The System-mode sheet, mounted for the length of one `window.print()`. */
  const [printing, setPrinting] = useState<ReceiptSheetProps | null>(null);
  /** Re-renders after a print so the preview picks up DUPLICATE. */
  const [, printed] = useReducer((count: number) => count + 1, 0);

  // Read once: this component only mounts after a tap, never on the server.
  const [paperChars] = useState(() => {
    const settings = readPrinterSettings();
    return settings.mode === PRINT_MODE.SYSTEM ? RECEIPT_WIDTH : settings.paperChars;
  });
  /** This device's "UPI QR on bills" switch (Printer screen). */
  const qrMode = upiQrMode(usePrinterSettings());
  // Frozen so the preview's clock does not tick while the counter reads it.
  const [openedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (!printing) return;
    // One frame for React to paint the sheet before the browser freezes the
    // page to rasterise it. Without this the print job catches an empty div.
    const frame = requestAnimationFrame(() => {
      window.print();
      setPrinting(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [printing]);

  /** For outcomes that close the pop-up — the toast is seen once it has gone. */
  const toast = (text: string) => dispatch(toastPushed(text, 'success'));
  const fail = (error: unknown, fallback: string) =>
    setMessage({ tone: 'error', text: counterMessage(apiErrorMessage(error, fallback)) });

  /** Sends one bill to this device's printer. Must run inside the tap. */
  function print(record: BillingExport | null) {
    if (!bill.data) return;
    const receipt = receiptFor(bill.data, record);
    const count = countPrint(printKey(sessionId, receipt.billNumber));
    const sheet: ReceiptSheetProps = {
      ...receipt,
      printedAt: new Date().toISOString(),
      isReprint: count > 1,
      settled: isClosed,
    };
    printDocument({ kind: 'receipt', receipt: sheet }, () => setPrinting(sheet));
    setNeedsTap(false);
    printed();
  }

  const wasPrinted = (record: BillingExport) =>
    peekPrintCount(printKey(sessionId, record.billNumber)) > 0;

  /** Runs the hook's fresh-read check; says what stopped the press, if anything. */
  async function stillGood(kitchen: boolean): Promise<boolean> {
    const problem = await table.checkFresh({ kitchen });
    if (problem) setMessage({ tone: 'error', text: problem });
    return !problem;
  }

  /** Will this press have to make a bill number first? */
  const makesNumber = canAct && !current && hasLines && !isClosed;

  async function handlePrintOnly() {
    setMessage(null);
    setBusy(makesNumber ? 'print-number' : 'print');
    try {
      // A closed table's bill and a view-only admin's print are reprints of
      // what is saved; anything else is checked against a fresh read first.
      if (canAct && !isClosed && !(await stillGood(false))) return;
      // A view-only admin prints what is saved; it never makes a number.
      const record = canAct ? await table.ensureCurrent() : current;
      if (makesNumber && record) {
        if (!tapStillLive()) {
          setNeedsTap(true);
          return;
        }
      }
      print(record);
    } catch (error) {
      fail(error, 'Could not make the bill number');
    } finally {
      setBusy(null);
    }
  }

  async function handlePrintAndPay() {
    setMessage(null);
    setBusy('pay-check');
    try {
      if (!(await stillGood(true))) return;
      setBusy(makesNumber ? 'pay-number' : 'pay-print');
      const record = await table.ensureCurrent();
      /*
       * The paper goes first, while the tap is still live. If it cannot, the
       * money is still recorded and the "paid" screen offers the print.
       *
       * A bill already printed on this device is not printed again: the guest
       * holds it (Print only, earlier), or a first press printed it and then
       * the close was refused. A second strip would be a DUPLICATE nobody
       * asked for.
       */
      let didPrint = Boolean(record && wasPrinted(record));
      if (!didPrint && (record || hasLines) && tapStillLive()) {
        print(record);
        didPrint = true;
      }
      setBusy('pay-settle');
      const paid = await table.settle({ note: methodNote(method), record, checked: true });
      finish(paid, didPrint);
    } catch (error) {
      fail(error, 'Could not close the table');
    } finally {
      setBusy(null);
    }
  }

  async function handlePaidNoPrint() {
    setMessage(null);
    setBusy('paid-check');
    try {
      if (!(await stillGood(true))) return;
      setBusy('paid');
      const paid = await table.settle({ note: methodNote(method), checked: true });
      finish(paid, true);
    } catch (error) {
      fail(error, 'Could not close the table');
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdate() {
    setMessage(null);
    setBusy('update');
    try {
      const record = await table.generate();
      setMessage({
        tone: 'info',
        text: savedBill
          ? `Bill ${record.billNumber} made. It replaces bill ${savedBill.billNumber}, which stays unpaid.`
          : `Bill ${record.billNumber} made.`,
      });
    } catch (error) {
      fail(error, 'Could not update the bill');
    } finally {
      setBusy(null);
    }
  }

  async function handleFree() {
    const reason = freeReasonText(freeReason, freeDetail);
    if (!reason) return;
    setMessage(null);
    setBusy('free');
    try {
      await table.free(reason);
      toast(`${bill.data?.tableCode ?? 'Table'} is free, nothing charged`);
      onSettled();
    } catch (error) {
      fail(error, 'Could not free the table');
    } finally {
      setBusy(null);
    }
  }

  function finish(record: BillingExport | null, didPrint: boolean) {
    toast(record ? `Bill ${record.billNumber} paid · table closed` : 'Table closed and free');
    if (didPrint || !record) {
      onSettled();
      return;
    }
    setSettled({ record, printed: false });
    setStep('done');
  }

  const data = bill.data;
  const tableCode = data?.tableCode ?? '';
  const isWorking = busy !== null;
  const makingNumber = busy === 'pay-number' || busy === 'print-number' || busy === 'update';
  const paying =
    busy === 'pay-check' || busy === 'pay-number' || busy === 'pay-print' || busy === 'pay-settle';
  /** Items the kitchen still has open — the table cannot close until they are done. */
  const kitchenLeft = canAct && !isClosed ? (bill.data?.kitchenPendingCount ?? 0) : 0;

  /* ── Body ──────────────────────────────────────────────────────────────── */

  let body: ReactNode;
  let footer: ReactNode;

  if (bill.isLoading) {
    body = <LoadingBlock label="Building the bill…" />;
  } else if (bill.isError || !data) {
    body = (
      <ErrorState
        message={apiErrorMessage(bill.error, 'Could not build this bill')}
        onRetry={() => void bill.refetch()}
      />
    );
    footer = (
      <Button variant="secondary" onClick={onClose}>
        Close
      </Button>
    );
  } else if (step === 'done' && settled?.record) {
    const record = settled.record;
    body = (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <span className="bg-status-ready-soft text-status-ready ring-status-ready/20 flex size-16 items-center justify-center rounded-full ring-8">
          <IconCheck aria-hidden className="size-8" />
        </span>
        <div>
          <p className="text-2xl font-bold">Bill {record.billNumber} paid</p>
          <p className="text-ink-muted mt-1">
            {formatBillTotal(record.total)} recorded in Sales · {tableCode} is free
          </p>
        </div>
        <p className="bg-status-pending-soft text-status-pending-ink rounded-xl px-4 py-2.5 text-sm">
          <IconInfo aria-hidden className="mr-1 inline size-4" />
          The receipt has not printed yet. Making the number took longer than the printer allows.
          Tap Print receipt.
        </p>
      </div>
    );
    footer = (
      <div className="grid w-full grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onSettled}>
          Done
        </Button>
        <Button
          onClick={() => {
            print(record);
            setSettled({ record, printed: true });
          }}
        >
          <IconPrint aria-hidden className="size-4" /> Print receipt
        </Button>
      </div>
    );
  } else if (step === 'free') {
    const reason = freeReasonText(freeReason, freeDetail);
    body = (
      <div className="flex flex-col gap-4">
        <div className="bg-status-cancelled-soft border-status-cancelled/25 rounded-2xl border p-4">
          <p className="text-status-cancelled-ink text-sm font-medium">Not collected</p>
          <p className="text-status-cancelled-ink text-3xl font-bold tabular-nums">
            {formatBillTotal(current?.total ?? data.total)}
          </p>
          <p className="text-status-cancelled-ink/80 mt-1 text-sm">
            A freed table never reaches Sales. Use this only when the guest did not pay.
          </p>
        </div>

        {savedBill && savedBill.exportStatus !== EXPORT_STATUS.CONFIRMED ? (
          <p
            role="alert"
            className="bg-status-pending-soft text-status-pending-ink border-status-pending/30 rounded-xl border px-4 py-3 text-sm"
          >
            <IconWarning aria-hidden className="mr-1 inline size-4" />
            <strong>Bill {savedBill.billNumber} was already made</strong> for{' '}
            {formatBillTotal(savedBill.total)}. If the guest paid, go back and press{' '}
            <strong>Print &amp; payment taken</strong>.
          </p>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">Why is it free?</legend>
          <div className="flex flex-wrap gap-2">
            {FREE_REASONS.map((option) => (
              <Chip
                key={option}
                selected={freeReason === option}
                onClick={() => setFreeReason(option)}
                tone="danger"
              >
                {option}
              </Chip>
            ))}
          </div>
        </fieldset>

        {freeReason === 'Table shifted' ? (
          <p className="bg-status-occupied-soft text-status-occupied-ink rounded-xl px-4 py-3 text-sm">
            <IconBillMoved aria-hidden className="mr-1 inline size-4" />
            Shifted tables should not be freed. Open this table on the waiter screen and use{' '}
            <strong>Move bill</strong>, so it is paid with the new table.
          </p>
        ) : null}

        <TextAreaField
          label={freeReason === 'Other' ? 'Details' : 'Details (optional)'}
          value={freeDetail}
          onChange={(event) => setFreeDetail(event.target.value)}
          placeholder="e.g. order placed from a copied link, nobody at the table"
          required={freeReason === 'Other'}
          maxLength={200}
        />
      </div>
    );
    footer = (
      <div className="grid w-full grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setStep('main')} disabled={isWorking}>
          Back
        </Button>
        <Button
          variant="danger"
          isLoading={busy === 'free'}
          disabled={!reason}
          onClick={() => void handleFree()}
        >
          Free {tableCode}
        </Button>
      </div>
    );
  } else {
    const amount = current?.total ?? data.total;
    // The big button skips the paper for a bill this device already printed.
    const paperDone = Boolean(current && wasPrinted(current));
    const previewNumber = current?.billNumber;
    const receipt = receiptFor(data, current);
    const text = buildReceiptText(
      {
        ...receipt,
        printedAt: openedAt,
        isReprint: previewNumber ? peekPrintCount(printKey(sessionId, previewNumber)) > 0 : false,
      },
      paperChars,
    );
    // The preview of a print that will make the number says so, rather than
    // showing the "(not generated)" an unnumbered draft prints.
    const body_ = makesNumber
      ? text.body.replace('BILL NO : (not generated)', 'BILL NO : (made on print)')
      : text.body;

    body = (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* The figure the counter says out loud. */}
          <div className="from-brand-600 to-brand-800 relative overflow-hidden rounded-2xl bg-linear-to-br p-5 text-white shadow-lg">
            <span
              aria-hidden
              className="absolute -top-10 -right-10 size-36 rounded-full bg-white/10"
            />
            <span
              aria-hidden
              className="absolute -right-4 -bottom-14 size-28 rounded-full bg-white/5"
            />
            <p className="relative text-sm font-medium text-white/80">
              {isClosed ? 'Charged' : 'To collect'}
            </p>
            <p className="relative mt-0.5 text-4xl font-bold tracking-tight tabular-nums">
              {formatBillTotal(amount)}
            </p>
            <p className="relative mt-2 text-sm text-white/80">
              Table {data.tableCode} · Session #{data.sessionNumber} · {data.itemCount} item
              {data.itemCount === 1 ? '' : 's'}
            </p>
          </div>

          <BillNumberCard
            current={current}
            stale={isStale ? savedBill : null}
            liveTotal={data.total}
            makingNumber={makingNumber}
            canUpdate={canAct && !isClosed && hasLines}
            onUpdate={() => void handleUpdate()}
            disabled={isWorking}
          />

          {needsTap && current ? (
            <button
              type="button"
              onClick={() => print(current)}
              className="bg-brand-50 text-brand-800 ring-brand-300 hover:bg-brand-100 animate-pulse-attention flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold ring-2 transition"
            >
              <IconPrint aria-hidden className="size-5" /> Bill {current.billNumber} is ready. Tap
              to print
            </button>
          ) : null}

          {canAct && !isClosed && !hasLines ? (
            <p
              role="status"
              className="bg-surface-muted text-ink-muted border-line flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
            >
              <IconInfo aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="text-ink">Nothing to bill.</strong> Nothing was ordered, or every
                item was cancelled. Use <strong>Free table without charging</strong> to release the
                table.
              </span>
            </p>
          ) : null}

          {kitchenLeft > 0 ? (
            <p
              role="status"
              className="bg-status-pending-soft text-status-pending-ink border-status-pending/30 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
            >
              <IconWarning aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong>
                  Kitchen has {kitchenLeft} item{kitchenLeft === 1 ? '' : 's'} still to finish.
                </strong>{' '}
                You can print the bill now. The table can be closed once they are served or
                cancelled.
              </span>
            </p>
          ) : null}

          {data.requiresReview ? (
            <p
              role="alert"
              className="bg-status-pending-soft text-status-pending-ink rounded-xl px-4 py-3 text-sm"
            >
              <IconWarning aria-hidden className="mr-1 inline size-4" /> Items were cancelled after
              the kitchen started them. Closing will be recorded as an override.
            </p>
          ) : null}

          {canAct && !isClosed && hasLines ? (
            <fieldset>
              <legend className="text-ink-muted mb-2 text-sm font-semibold">
                Paid by <span className="font-normal">(optional)</span>
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map(({ id, icon: Icon }) => (
                  <Chip
                    key={id}
                    selected={method === id}
                    onClick={() => setMethod(method === id ? null : id)}
                    block
                  >
                    <Icon aria-hidden className="size-4" /> {id}
                  </Chip>
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>

        <ReceiptPreview
          body={body_}
          netTotal={text.netTotal}
          foot={text.foot}
          dimmed={makingNumber}
          upiQr={receiptUpiQr({ ...receipt, settled: isClosed }, qrMode)}
          qrMode={qrMode}
          paid={isClosed}
        />
      </div>
    );

    if (!canAct || isClosed) {
      footer = (
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            isLoading={busy === 'print'}
            onClick={() => void handlePrintOnly()}
            leadingIcon={<IconPrint aria-hidden className="size-4" />}
          >
            {current ? 'Reprint bill' : 'Print'}
          </Button>
        </div>
      );
    } else {
      footer = (
        <div className="flex w-full flex-col gap-2.5">
          <button
            type="button"
            disabled={isWorking || !hasLines}
            aria-busy={paying || undefined}
            onClick={() => void handlePrintAndPay()}
            className={cn(
              'group bg-status-ready shadow-status-ready/30 relative flex min-h-16 w-full items-center gap-3 overflow-hidden rounded-2xl px-4 py-2.5 text-left text-white shadow-lg transition sm:px-5',
              'hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
              {paying ? (
                <Spinner className="size-5" />
              ) : paperDone ? (
                <IconCheck aria-hidden className="size-5" />
              ) : (
                <IconPrint aria-hidden className="size-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base leading-tight font-bold sm:text-lg">
                {busy === 'pay-check'
                  ? 'Checking kitchen…'
                  : busy === 'pay-number'
                    ? isStale
                      ? 'Making new bill number…'
                      : 'Making bill number…'
                    : busy === 'pay-print'
                      ? 'Printing…'
                      : busy === 'pay-settle'
                        ? 'Closing table…'
                        : paperDone
                          ? 'Payment taken'
                          : 'Print & payment taken'}
              </span>
              <span className="mt-0.5 block text-xs text-white/85 sm:text-sm">
                {isStale && savedBill
                  ? `New bill replaces bill ${savedBill.billNumber} · prints, marks`
                  : paperDone
                    ? 'Already printed · marks'
                    : 'Prints, marks'}{' '}
                paid
                {method ? ` (${method})` : ''} and frees {tableCode}
              </span>
            </span>
            <span className="shrink-0 text-lg font-bold tabular-nums sm:text-xl">
              {formatBillTotal(amount)}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              isLoading={busy === 'print' || busy === 'print-number'}
              disabled={isWorking || !hasLines}
              onClick={() => void handlePrintOnly()}
              leadingIcon={<IconPrint aria-hidden className="size-4" />}
              className="whitespace-nowrap"
            >
              {busy === 'print-number' ? 'Making number…' : paperDone ? 'Reprint' : 'Print only'}
            </Button>
            <Button
              variant="secondary"
              isLoading={busy === 'paid' || busy === 'paid-check'}
              disabled={isWorking || !hasLines}
              onClick={() => void handlePaidNoPrint()}
              leadingIcon={<IconCheck aria-hidden className="size-4" />}
              className="whitespace-nowrap"
            >
              Paid, no print
            </Button>
          </div>

          <button
            type="button"
            disabled={isWorking}
            onClick={() => setStep('free')}
            className="text-status-cancelled-ink hover:bg-status-cancelled-soft mx-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition disabled:opacity-50"
          >
            <IconFreeTable aria-hidden className="size-4" /> Free table without charging
          </button>
        </div>
      );
    }
  }

  /*
   * The outcome sits in the fixed footer, above the buttons, not at the top
   * of the scrolling body: scrolled down to the receipt, a refusal printed
   * up there was out of sight, and the table just stayed open.
   */
  const banner = message ? (
    <p
      role={message.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex w-full items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium',
        message.tone === 'error'
          ? 'border-status-cancelled/30 bg-status-cancelled-soft text-status-cancelled-ink'
          : 'border-status-ready/30 bg-status-ready-soft text-status-ready-ink',
      )}
    >
      {message.tone === 'error' ? (
        <IconWarning aria-hidden className="mt-0.5 size-4 shrink-0" />
      ) : (
        <IconCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1">{message.text}</span>
      <button
        type="button"
        onClick={() => setMessage(null)}
        aria-label="Dismiss"
        className="-my-1 -mr-2 rounded-lg px-2 py-1 opacity-70 hover:opacity-100"
      >
        ×
      </button>
    </p>
  ) : null;

  return (
    <>
      {/* Outside the dialog, like the KOT sheet: print CSS shows only this. */}
      {printing ? <ReceiptSheet {...printing} /> : null}

      <Modal
        open
        onClose={onClose}
        dismissible={!isWorking}
        size="lg"
        icon={<IconBill aria-hidden className="size-5" />}
        title={
          step === 'free'
            ? `Free ${tableCode} without charging?`
            : tableCode
              ? `Table ${tableCode} · Checkout`
              : 'Checkout'
        }
        description={
          step === 'free'
            ? 'Nothing is billed and nothing is deleted. Unfinished kitchen items are written off.'
            : isClosed
              ? 'This table is closed. You can reprint its bill.'
              : 'Print, take payment and free the table in one tap.'
        }
        footer={
          banner || footer ? (
            <div className="flex w-full flex-col gap-2.5">
              {banner}
              {footer}
            </div>
          ) : undefined
        }
      >
        {body}
      </Modal>
    </>
  );
}

/** Where the bill number stands: none yet, current, or out of date. */
function BillNumberCard({
  current,
  stale,
  liveTotal,
  makingNumber,
  canUpdate,
  onUpdate,
  disabled,
}: {
  current: BillingExport | null;
  /** The saved bill the table has ordered past, if any. */
  stale: BillingExport | null;
  liveTotal: number;
  makingNumber: boolean;
  canUpdate: boolean;
  onUpdate: () => void;
  disabled: boolean;
}) {
  if (makingNumber) {
    return (
      <div className="border-brand-200 bg-brand-50 text-brand-800 flex items-center gap-3 rounded-2xl border p-4">
        <Spinner className="size-5" />
        <div>
          <p className="font-semibold">Making bill number…</p>
          <p className="text-brand-700/80 text-sm">Saving this bill so it gets its own number.</p>
        </div>
      </div>
    );
  }

  if (stale) {
    return (
      <div className="border-status-pending/40 bg-status-pending-soft text-status-pending-ink flex flex-col gap-3 rounded-2xl border p-4">
        <div className="flex items-start gap-3">
          <IconWarning aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Bill {stale.billNumber} is out of date</p>
            <p className="text-sm">
              It was for {formatBillTotal(stale.total)}. The table ordered more since and now owes{' '}
              {formatBillTotal(liveTotal)}. The next print makes a new number for the right amount.
            </p>
          </div>
        </div>
        {canUpdate ? (
          <Button variant="secondary" size="sm" onClick={onUpdate} disabled={disabled}>
            <IconRefresh aria-hidden className="size-4" /> Update bill now
          </Button>
        ) : null}
      </div>
    );
  }

  if (current) {
    const paid = current.exportStatus === EXPORT_STATUS.CONFIRMED;
    return (
      <div className="border-line bg-surface flex items-center justify-between gap-3 rounded-2xl border p-4">
        <div>
          <p className="text-ink-muted text-xs font-semibold tracking-wide uppercase">Bill no.</p>
          <p className="text-2xl font-bold tabular-nums">{current.billNumber}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase',
            paid
              ? 'bg-status-ready-soft text-status-ready-ink'
              : 'bg-status-occupied-soft text-status-occupied-ink',
          )}
        >
          {paid ? <IconCheck aria-hidden className="size-3.5" /> : null}
          {paid ? 'Paid' : 'Saved, not paid'}
        </span>
      </div>
    );
  }

  return (
    <div className="border-line bg-surface-muted flex items-start gap-3 rounded-2xl border border-dashed p-4">
      <IconInfo aria-hidden className="text-ink-muted mt-0.5 size-5 shrink-0" />
      <div>
        <p className="font-semibold">No bill number yet</p>
        <p className="text-ink-muted text-sm">It is made automatically on the first print.</p>
      </div>
    </div>
  );
}

/**
 * The paper, exactly as the printer will produce it — the same
 * `buildReceiptText` the printer is sent, at this device's paper width.
 * Fixed colours, not theme tokens: the printer has one ink.
 */
function ReceiptPreview({
  body,
  netTotal,
  foot,
  dimmed,
  upiQr,
  qrMode,
  paid,
}: {
  body: string;
  netTotal: string;
  foot: string;
  dimmed: boolean;
  /** The QR this bill will print, or null for none. */
  upiQr: string | null;
  /** The device's choice — said under the paper, with a way to change it. */
  qrMode: UpiQrMode;
  paid: boolean;
}) {
  // Same place as on paper: between the tax table and the thank-you line.
  const footLines = foot.split('\n');
  const thanks = upiQr ? footLines.pop() : undefined;

  return (
    <div className="bg-surface-sunken flex min-w-0 flex-col items-center gap-2 rounded-2xl p-4">
      <div className="thin-scrollbar flex max-w-full justify-center overflow-x-auto">
        <div
          className={cn(
            'relative w-max bg-white px-4 pt-5 pb-7 font-mono text-[0.72rem] leading-snug text-black shadow-md transition-opacity',
            dimmed && 'animate-pulse opacity-60',
          )}
          // A torn-off edge, so it reads as paper rather than as a code block.
          style={{
            maskImage:
              'linear-gradient(#000 0 0) top / 100% calc(100% - 8px) no-repeat, radial-gradient(circle 5px at 50% 100%, transparent 98%, #000) bottom / 12px 9px repeat-x',
          }}
          aria-label="Receipt preview"
        >
          <pre className="whitespace-pre">{body}</pre>
          <p className="my-1 flex justify-between text-[0.95rem] font-bold">
            <span>NET TOTAL</span>
            <span>{netTotal}</span>
          </p>
          <pre className="whitespace-pre">{footLines.join('\n')}</pre>
          {upiQr ? (
            <>
              <UpiQrPicture payload={upiQr} className="mx-auto mt-2 block size-28" />
              <p className="mb-1 text-center font-bold">{scanAndPay(netTotal, qrMode)}</p>
              <pre className="whitespace-pre">{thanks}</pre>
            </>
          ) : null}
        </div>
      </div>
      <p className="text-ink-muted text-xs">
        UPI QR on bills:{' '}
        <span className="text-ink font-semibold">
          {qrMode === 'off'
            ? 'Off'
            : paid
              ? 'On (not on paid bills)'
              : qrMode === 'amount'
                ? 'On, amount filled in'
                : 'On, guest types the amount'}
        </span>{' '}
        ·{' '}
        <Link href="/printer" className="text-brand-700 font-semibold hover:underline">
          Change
        </Link>
      </p>
    </div>
  );
}

/** A pill-shaped choice that says "selected" with a tick, not colour alone. */
function Chip({
  selected,
  onClick,
  children,
  tone = 'brand',
  block = false,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: 'brand' | 'danger';
  block?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'min-h-touch inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium transition',
        block && 'w-full',
        selected
          ? tone === 'danger'
            ? 'border-status-cancelled bg-status-cancelled-soft text-status-cancelled-ink ring-status-cancelled/20 ring-2'
            : 'border-brand-500 bg-brand-50 text-brand-800 ring-brand-500/20 ring-2'
          : 'border-line bg-surface text-ink hover:bg-surface-muted',
      )}
    >
      {selected ? <IconCheck aria-hidden className="size-3.5" /> : null}
      {children}
    </button>
  );
}

/**
 * The server's refusal, in the counter's words.
 *
 * "Close with force to override" is an API instruction; the person at the
 * counter needs to know what to do on the floor instead.
 */
function counterMessage(text: string): string {
  if (/kitchen has not finished/i.test(text)) {
    return 'The kitchen has not finished every item on this table. Mark them served (or cancel them) on the kitchen screen, then press again. The bill is saved and not yet marked paid.';
  }
  return text;
}

function methodNote(method: Method | null): string {
  return method ? `Paid by ${method}` : '';
}

function freeReasonText(reason: FreeReason | null, detail: string): string {
  const extra = detail.trim();
  if (!reason) return extra;
  if (reason === 'Other') return extra;
  return extra ? `${reason}: ${extra}` : reason;
}
