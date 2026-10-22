import { describeBluetoothError, printOverBluetooth } from './bluetooth-printer';
import { encodeJob, type PrintJob } from './print-jobs';
import { PRINT_MODE, readPrinterSettings } from './print-settings';
import { sendToRawbt } from './rawbt';

/**
 * The one print function every Print button calls.
 *
 * Reads this device's mode and either runs the screen's own `systemPrint`
 * (today's `window.print()` path, untouched) or sends ESC/POS bytes straight
 * to the printer. Each screen keeps its own system path because each mounts
 * its HTML sheet differently; this only decides whether that path runs.
 *
 * **Never leaves the counter with no way to print.** If the direct path fails,
 * the notice it raises carries a "Print with system dialog instead" button
 * wired to that same `systemPrint`.
 */

export type PrintNotice =
  | { tone: 'sending'; message: string }
  | { tone: 'sent'; message: string }
  | { tone: 'failed'; message: string; fallback: () => void };

/*
 * The notice lives here rather than in the Redux toast list because it holds
 * a callback, and Redux state must stay serialisable. `PrintNoticeHost`
 * renders it.
 */
let notice: PrintNotice | null = null;
let sentTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function setNotice(next: PrintNotice | null): void {
  if (sentTimer) clearTimeout(sentTimer);
  sentTimer = null;
  notice = next;
  for (const listener of listeners) listener();
  if (next?.tone === 'sent') sentTimer = setTimeout(() => setNotice(null), 3_000);
}

export function getPrintNotice(): PrintNotice | null {
  return notice;
}

export function getServerPrintNotice(): PrintNotice | null {
  return null;
}

export function subscribePrintNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function dismissPrintNotice(): void {
  setNotice(null);
}

function fail(message: string, systemPrint: () => void): void {
  setNotice({
    tone: 'failed',
    message,
    fallback: () => {
      setNotice(null);
      systemPrint();
    },
  });
}

/**
 * Prints `job` the way this device is set up to.
 *
 * Synchronous up to the hand-off, on purpose: RawBT is opened by navigating
 * to an app link and Bluetooth's chooser by `requestDevice`, and both only
 * work inside the user's tap.
 */
export function printDocument(job: PrintJob, systemPrint: () => void): void {
  const settings = readPrinterSettings();
  if (settings.mode === PRINT_MODE.SYSTEM) {
    systemPrint();
    return;
  }

  let bytes: Uint8Array;
  try {
    bytes = encodeJob(job, settings.paperChars);
  } catch {
    fail('Could not prepare this for the printer.', systemPrint);
    return;
  }

  if (settings.mode === PRINT_MODE.RAWBT) {
    try {
      sendToRawbt(bytes);
    } catch {
      fail('Could not open RawBT. Is it installed on this tablet?', systemPrint);
    }
    return;
  }

  setNotice({ tone: 'sending', message: 'Printing…' });
  printOverBluetooth(bytes).then(
    () => setNotice({ tone: 'sent', message: 'Sent to the printer' }),
    (error: unknown) => fail(describeBluetoothError(error), systemPrint),
  );
}
