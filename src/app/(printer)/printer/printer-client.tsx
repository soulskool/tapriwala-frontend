'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  IconBluetooth,
  IconCheck,
  IconInfo,
  IconPrint,
  IconPrinterConnected,
  IconPrinterDisconnected,
  IconRawbt,
  IconWarning,
  type IconType,
} from '@/components/ui/icons';
import { useBluetoothPrinter, usePrinterSettings } from '@/hooks/use-printer';
import {
  choosePrinter,
  describeBluetoothError,
  forgetPrinter,
  reconnectPrinter,
} from '@/lib/print/bluetooth-printer';
import { printDocument } from '@/lib/print/print-document';
import {
  PAPER_CHARS,
  PRINT_MODE,
  writePrinterSettings,
  type PaperChars,
  type PrintMode,
} from '@/lib/print/print-settings';
import { isProbablyAndroid } from '@/lib/print/rawbt';
import { cn } from '@/lib/utils';

/**
 * The Printer screen.
 *
 * Written for the café owner and the counter, not for developers: what to
 * choose on which device, how to tell whether the printer can do Bluetooth
 * Low Energy, and what to do when it cannot. Everything here is stored on
 * this device only (see `lib/print/print-settings.ts`).
 */

const MODE_OPTIONS: { mode: PrintMode; title: string; icon: IconType; summary: string }[] = [
  {
    mode: PRINT_MODE.SYSTEM,
    title: 'System print',
    icon: IconPrint,
    summary:
      'The browser’s Print dialog. For the Windows laptop with the printer on a USB cable, leave it on this.',
  },
  {
    mode: PRINT_MODE.BLUETOOTH,
    title: 'Bluetooth (direct)',
    icon: IconBluetooth,
    summary:
      'One tap prints, straight to the printer. Chrome only, and the printer must support Bluetooth Low Energy (BLE).',
  },
  {
    mode: PRINT_MODE.RAWBT,
    title: 'RawBT (Android app)',
    icon: IconRawbt,
    summary:
      'One tap hands the bill to the RawBT app, which prints over Bluetooth or a USB cable. Use this if Bluetooth (direct) cannot find the printer.',
  },
];

const MODE_LABEL: Record<PrintMode, string> = {
  system: 'System print',
  bluetooth: 'Bluetooth',
  rawbt: 'RawBT',
};

const subscribeNever = () => () => {};

export function PrinterClient() {
  const settings = usePrinterSettings();
  const bluetooth = useBluetoothPrinter();
  // Read after hydration only — the server cannot know the device.
  const android = useSyncExternalStore(subscribeNever, isProbablyAndroid, () => false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bluetoothMissing = bluetooth.status === 'unsupported';
  const direct = settings.mode !== PRINT_MODE.SYSTEM;

  function chooseMode(mode: PrintMode) {
    setError(null);
    writePrinterSettings({ mode });
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      setError(describeBluetoothError(reason));
    } finally {
      setBusy(false);
    }
  }

  function testPrint() {
    setError(null);
    printDocument(
      {
        kind: 'test',
        modeLabel: MODE_LABEL[settings.mode],
        printedAt: new Date().toISOString(),
      },
      () => window.print(),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Printer</h1>
        <p className="text-ink-muted text-sm">
          How <span className="font-semibold">this device</span> prints bills and KOTs. Set it once
          on each device: the laptop and the tablet can print different ways.
        </p>
      </div>

      {/* ── Step 1 ─────────────────────────────────────────────────────── */}
      <Section step="Step 1" title="Which way should this device print?">
        <ul className="text-ink-muted mb-3 list-disc pl-5 text-sm">
          <li>
            <span className="text-ink font-semibold">Windows laptop</span> with the printer on a USB
            cable: leave <span className="font-semibold">System print</span>. Nothing to change.
          </li>
          <li>
            <span className="text-ink font-semibold">Android tablet</span>: try{' '}
            <span className="font-semibold">Bluetooth (direct)</span> first. If the printer does not
            appear, use <span className="font-semibold">RawBT</span>.
          </li>
        </ul>

        <div role="radiogroup" aria-label="Print mode" className="flex flex-col gap-2">
          {MODE_OPTIONS.map((option) => {
            const selected = settings.mode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => chooseMode(option.mode)}
                className={cn(
                  'rounded-card min-h-touch flex items-start gap-3 border-2 p-3 text-left transition',
                  selected
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-line bg-surface hover:bg-surface-muted',
                )}
              >
                <option.icon aria-hidden className="mt-0.5 size-5 shrink-0" />
                <span className="flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    {option.title}
                    {selected ? (
                      <span className="bg-brand-600 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white">
                        <IconCheck aria-hidden className="size-3" /> Selected
                      </span>
                    ) : null}
                  </span>
                  <span className="text-ink-muted block text-sm">{option.summary}</span>
                  {option.mode === PRINT_MODE.BLUETOOTH && bluetoothMissing ? (
                    <Warning>
                      This browser has no Bluetooth. Use Chrome (not Samsung Internet, Safari or
                      Firefox). iPad and iPhone browsers cannot do this at all.
                    </Warning>
                  ) : null}
                  {option.mode === PRINT_MODE.RAWBT && !android ? (
                    <span className="text-ink-muted mt-1 block text-xs">
                      RawBT is an Android app, and this device does not look like Android.
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── This device's printer ──────────────────────────────────────── */}
      {direct ? (
        <Section title="This device’s printer">
          {settings.mode === PRINT_MODE.BLUETOOTH ? (
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2 font-semibold">
                {bluetooth.status === 'connected' ? (
                  <>
                    <IconPrinterConnected aria-hidden className="text-status-ready-ink size-5" />
                    Connected to {bluetooth.deviceName ?? 'printer'}
                  </>
                ) : (
                  <>
                    <IconPrinterDisconnected
                      aria-hidden
                      className="text-status-cancelled-ink size-5"
                    />
                    {bluetooth.status === 'connecting'
                      ? 'Connecting…'
                      : bluetooth.deviceName
                        ? `Not connected (last printer: ${bluetooth.deviceName})`
                        : 'No printer connected'}
                  </>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  isLoading={busy}
                  disabled={bluetoothMissing || busy}
                  onClick={() => void run(choosePrinter)}
                >
                  <IconBluetooth aria-hidden className="mr-1.5 inline size-4" />
                  {bluetooth.deviceName ? 'Choose a different printer' : 'Connect printer'}
                </Button>
                {bluetooth.deviceName && bluetooth.status !== 'connected' ? (
                  <Button
                    variant="secondary"
                    disabled={bluetoothMissing || busy}
                    onClick={() => void run(reconnectPrinter)}
                  >
                    Reconnect printer
                  </Button>
                ) : null}
                {bluetooth.deviceName ? (
                  <Button variant="ghost" disabled={busy} onClick={() => void run(forgetPrinter)}>
                    Forget printer
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm">
              Printing is handed to the <span className="font-semibold">RawBT</span> app. Set the
              printer up inside RawBT (Step 3b below), then test print here.
            </p>
          )}

          <div className="mt-4">
            <p className="mb-1 text-sm font-semibold">Characters per line</p>
            <div role="radiogroup" aria-label="Characters per line" className="flex gap-2">
              {PAPER_CHARS.map((chars) => (
                <WidthButton
                  key={chars}
                  chars={chars}
                  selected={settings.paperChars === chars}
                  onSelect={() => writePrinterSettings({ paperChars: chars })}
                />
              ))}
            </div>
            <p className="text-ink-muted mt-1 text-xs">
              48 suits most 80 mm (3 inch) printers. If the test print cuts off the last digit of
              the ruler, pick the next one down. 32 is for 58 mm paper.
            </p>
          </div>

          <div className="mt-4">
            <Button
              variant="success"
              disabled={settings.mode === PRINT_MODE.BLUETOOTH && bluetoothMissing}
              onClick={testPrint}
            >
              <IconPrint aria-hidden className="mr-1.5 inline size-4" /> Test print
            </Button>
          </div>

          {error ? (
            <p role="alert" className="text-status-cancelled-ink mt-3 text-sm font-medium">
              <IconWarning aria-hidden className="mr-1 inline size-4" /> {error}
            </p>
          ) : null}
        </Section>
      ) : (
        <Section title="This device’s printer">
          <p className="text-sm">
            Every Print button opens the browser’s Print dialog, exactly as before. Nothing to set
            up on a laptop whose printer already has a Windows driver.
          </p>
        </Section>
      )}

      {/* ── Step 2 ─────────────────────────────────────────────────────── */}
      <Section step="Step 2" title="Does your printer support “Bluetooth Low Energy”?">
        <p className="mb-2 text-sm">Look at the printer’s label, box or manual:</p>
        <div className="rounded-card border-line overflow-x-auto border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  You see
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Meaning
                </th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              <tr>
                <td className="px-3 py-2">
                  “BLE”, “Bluetooth 4.0” or higher, “Dual mode”, “Bluetooth Low Energy”
                </td>
                <td className="text-status-ready-ink px-3 py-2 font-medium">
                  <IconCheck aria-hidden className="mr-1 inline size-4" /> Bluetooth (direct) should
                  work
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2">Only “Bluetooth 2.0”, “3.0” or “SPP”</td>
                <td className="text-status-pending-ink px-3 py-2 font-medium">
                  <IconWarning aria-hidden className="mr-1 inline size-4" /> Classic only. Bluetooth
                  (direct) will <span className="font-bold">not</span> find it. Use RawBT.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2">Just “Bluetooth”, no version</td>
                <td className="text-ink-muted px-3 py-2 font-medium">
                  <IconInfo aria-hidden className="mr-1 inline size-4" /> Unknown. Try Connect
                  printer. If it is not in the list, use RawBT.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-ink-muted mt-2 text-sm">
          Free check: install <span className="text-ink font-semibold">nRF Connect for Mobile</span>{' '}
          (Nordic Semiconductor), close the old POS app, tap SCAN. If the printer’s name appears, it
          supports BLE. Android’s normal Bluetooth settings list both kinds, so they cannot tell
          you.
        </p>
      </Section>

      {/* ── Step 3 ─────────────────────────────────────────────────────── */}
      <Section step="Step 3a" title="Bluetooth (direct)">
        <Steps>
          <li>
            Use <span className="font-semibold">Chrome</span> (not Samsung Internet, not Safari).
          </li>
          <li>
            Close the old POS app and turn its printer connection off. The printer talks to only one
            device at a time.
          </li>
          <li>
            Printer on. Choose <span className="font-semibold">Bluetooth (direct)</span> above, tap{' '}
            <span className="font-semibold">Connect printer</span> and pick it from the list.
          </li>
          <li>
            Tap <span className="font-semibold">Test print</span>. Done. Every Print button now
            prints in one tap.
          </li>
          <li>
            If the tablet restarts or the page reloads, tap{' '}
            <span className="font-semibold">Reconnect printer</span> once: on the red bar at the
            top, or here on this screen. The printer chip in the header always shows whether it is
            connected.
          </li>
        </Steps>
      </Section>

      <Section step="Step 3b" title="RawBT (if Bluetooth did not find the printer)">
        <Steps>
          <li>
            Install <span className="font-semibold">RawBT</span> from the Play Store.
          </li>
          <li>
            In RawBT choose the connection (<span className="font-semibold">Bluetooth</span> (pair
            the printer) or <span className="font-semibold">USB</span> (see 3c)) and paper{' '}
            <span className="font-semibold">80 mm / 3 inch</span>. Do RawBT’s own test print.
          </li>
          <li>
            Here, choose <span className="font-semibold">RawBT</span> and tap{' '}
            <span className="font-semibold">Test print</span>. When Chrome asks to open RawBT, allow
            it (“Always”).
          </li>
        </Steps>
      </Section>

      <Section step="Step 3c" title="USB cable instead of Bluetooth (OTG)">
        <Steps>
          <li>
            Buy a <span className="font-semibold">USB-OTG adapter</span>: USB-A female to the
            tablet’s port (USB-C on most tablets), about ₹100–200. Better: one with a charging port,
            so the tablet charges while printing (not every tablet supports both at once, so test
            it).
          </li>
          <li>
            Printer’s USB cable → OTG adapter → tablet. Allow RawBT to use the USB device
            (“Always”).
          </li>
          <li>
            In RawBT choose <span className="font-semibold">USB</span>, test print, then choose{' '}
            <span className="font-semibold">RawBT</span> here.
          </li>
          <li>Downside: the tablet is tied to the printer by the cable.</li>
        </Steps>
      </Section>

      <Section title="If nothing else works">
        <p className="text-sm">
          With RawBT installed, leave this device on{' '}
          <span className="font-semibold">System print</span> and pick{' '}
          <span className="font-semibold">RawBT</span> as the printer in Chrome’s Print dialog. It
          takes a few more taps per bill, but needs nothing else.
        </p>
        <p className="text-ink-muted mt-2 text-sm">
          <span className="text-ink font-semibold">Not supported:</span> iPad and Safari cannot use
          either way. An iPad needs a printer with AirPrint.
        </p>
      </Section>
    </div>
  );
}

function Section({ step, title, children }: { step?: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border-line bg-surface border p-4">
      <h2 className="mb-2 text-lg font-bold">
        {step ? (
          <span className="text-brand-700 mr-2 text-sm font-bold uppercase">{step}</span>
        ) : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">{children}</ol>;
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <span className="text-status-cancelled-ink mt-1 flex items-start gap-1 text-xs font-medium">
      <IconWarning aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </span>
  );
}

function WidthButton({
  chars,
  selected,
  onSelect,
}: {
  chars: PaperChars;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'min-h-touch min-w-touch rounded-lg border px-3 text-sm font-semibold tabular-nums',
        selected
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-line bg-surface hover:bg-surface-muted',
      )}
    >
      {chars}
    </button>
  );
}
