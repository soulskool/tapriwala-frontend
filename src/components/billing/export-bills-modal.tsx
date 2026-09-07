'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { IconDownload, IconWarning } from '@/components/ui/icons';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { downloadBillsXlsx } from '@/store/api/billing-api';

/**
 * "Give me the bills as a spreadsheet."
 *
 * The filters are deliberately the three an owner actually asks for — a date
 * range, and whether they want everything, only what was paid, or only what is
 * still owed. Anything finer is a job for Excel once the file is open, which is
 * the whole reason for handing over a workbook rather than another screen.
 *
 * The file is built server-side. The browser never holds the history in
 * memory, so exporting a busy month costs one request whatever its size.
 */

type Settlement = 'all' | 'paid' | 'unsettled';

const SETTLEMENT_OPTIONS: { value: Settlement; label: string; hint: string }[] = [
  { value: 'all', label: 'All bills', hint: 'Everything billed in the range' },
  { value: 'paid', label: 'Paid only', hint: 'Payment was taken and the table closed' },
  { value: 'unsettled', label: 'Unsettled only', hint: 'Billed but never marked paid' },
];

/** `settled` is a tri-state on the wire: omitted means "do not filter". */
const SETTLED_PARAM: Record<Settlement, boolean | undefined> = {
  all: undefined,
  paid: true,
  unsettled: false,
};

/**
 * Names the file after what is actually in it.
 *
 * Both dates are optional and independently so — "everything since we opened",
 * "everything up to the audit date" and "this week" are all real asks — which
 * is why this is four cases rather than one template.
 */
function filenameFor(from: string, to: string, settlement: Settlement): string {
  const range =
    from && to ? `${from}-to-${to}` : from ? `from-${from}` : to ? `until-${to}` : 'all';
  const suffix = settlement === 'all' ? '' : `-${settlement}`;
  return `bills-${range}${suffix}.xlsx`;
}

export function ExportBillsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  /*
   * Both dates start empty, and empty means "no bound on that side".
   *
   * Pre-filling them would silently decide the answer: someone opening this to
   * export everything would get whatever range happened to be sitting in the
   * inputs and no reason to doubt it. A blank field asks the question rather
   * than quietly answering it.
   */
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [settlement, setSettlement] = useState<Settlement>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidRange = Boolean(from && to && from > to);

  async function handleDownload() {
    if (invalidRange) return;
    setBusy(true);
    setError(null);

    try {
      await downloadBillsXlsx(
        {
          ...(from ? { from: `${from}T00:00:00.000Z` } : {}),
          // End of the chosen day, not its midnight — otherwise "to: today"
          // returns nothing, because every bill today is after 00:00.
          ...(to ? { to: `${to}T23:59:59.999Z` } : {}),
          ...(SETTLED_PARAM[settlement] !== undefined
            ? { settled: SETTLED_PARAM[settlement] }
            : {}),
        },
        filenameFor(from, to, settlement),
      );
      onClose();
    } catch (downloadError) {
      setError(
        downloadError instanceof Error ? downloadError.message : 'Could not download the file',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export bills to Excel"
      description="Downloads an .xlsx workbook with one sheet of bills and one of individual line items. Leave both dates blank to export every bill."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={busy} disabled={invalidRange} onClick={() => void handleDownload()}>
            <IconDownload aria-hidden className="mr-1.5 inline size-4" /> Download
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="From"
            type="date"
            value={from}
            max={to || undefined}
            hint="Optional"
            onChange={(event) => setFrom(event.target.value)}
          />
          <TextField
            label="To"
            type="date"
            value={to}
            min={from || undefined}
            hint="Optional"
            onChange={(event) => setTo(event.target.value)}
          />
        </div>

        {invalidRange ? (
          <p role="alert" className="text-status-cancelled-ink text-sm font-medium">
            The start date is after the end date.
          </p>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Which bills?</legend>
          {SETTLEMENT_OPTIONS.map((option) => {
            const active = settlement === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2.5 transition',
                  'focus-within:ring-brand-500 focus-within:ring-2 focus-within:ring-offset-1',
                  active ? 'border-brand-600 bg-brand-50' : 'border-line hover:bg-surface-muted',
                )}
              >
                <input
                  type="radio"
                  name="settlement"
                  value={option.value}
                  checked={active}
                  onChange={() => setSettlement(option.value)}
                  className="accent-brand-600 mt-1 size-4"
                />
                <span className="flex flex-col">
                  <span className="font-semibold">{option.label}</span>
                  <span className="text-ink-muted text-sm">{option.hint}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {error ? (
          <p
            role="alert"
            className="rounded-card border-status-cancelled/40 bg-status-cancelled-soft text-status-cancelled-ink border px-3 py-2 text-sm"
          >
            <IconWarning aria-hidden className="mr-1 inline size-4" />
            {error}
          </p>
        ) : null}

        <p className="text-ink-muted text-xs">
          Very large ranges are capped, and the sheet says so on its last row if that happens —
          narrow the dates and export again.
        </p>
      </div>
    </Modal>
  );
}
