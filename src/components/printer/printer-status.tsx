'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  IconClose,
  IconPrint,
  IconPrinterConnected,
  IconPrinterConnecting,
  IconPrinterDisconnected,
  IconRawbt,
  type IconType,
} from '@/components/ui/icons';
import { useBluetoothPrinter, usePrinterSettings } from '@/hooks/use-printer';
import {
  describeBluetoothError,
  reconnectPrinter,
  restorePrinter,
  type BluetoothStatus,
} from '@/lib/print/bluetooth-printer';
import { PRINT_MODE, writePrinterSettings } from '@/lib/print/print-settings';
import { cn } from '@/lib/utils';

interface ChipState {
  label: string;
  icon: IconType;
  className: string;
}

const BLUETOOTH_CHIP: Record<BluetoothStatus, ChipState> = {
  connected: {
    label: 'Printer connected',
    icon: IconPrinterConnected,
    className: 'border-status-ready/40 bg-status-ready-soft text-status-ready-ink',
  },
  connecting: {
    label: 'Connecting printer…',
    icon: IconPrinterConnecting,
    className: 'border-status-pending/40 bg-status-pending-soft text-status-pending-ink',
  },
  disconnected: {
    label: 'Printer not connected',
    icon: IconPrinterDisconnected,
    className: 'border-status-cancelled/40 bg-status-cancelled-soft text-status-cancelled-ink',
  },
  lost: {
    label: 'Printer not connected',
    icon: IconPrinterDisconnected,
    className: 'border-status-cancelled/40 bg-status-cancelled-soft text-status-cancelled-ink',
  },
  unsupported: {
    label: 'No Bluetooth here',
    icon: IconPrinterDisconnected,
    className: 'border-status-cancelled/40 bg-status-cancelled-soft text-status-cancelled-ink',
  },
};

const SYSTEM_CHIP: ChipState = {
  label: 'System print',
  icon: IconPrint,
  className: 'border-line bg-surface text-ink-muted',
};

const RAWBT_CHIP: ChipState = {
  label: 'RawBT',
  icon: IconRawbt,
  className: 'border-line bg-surface text-ink-muted',
};

/**
 * How this device prints, in the header of every staff screen.
 *
 * Colour, icon and words together (rule 11), and a link to the Printer
 * screen, which is the only way to get there — it is a setup page, not a
 * destination anyone needs in the nav mid-service.
 *
 * Also where a reloaded page tries to win its Bluetooth printer back without
 * a tap, once, wherever the device happens to land first.
 */
export function PrinterStatusChip({ className }: { className?: string }) {
  const settings = usePrinterSettings();
  const bluetooth = useBluetoothPrinter();

  useEffect(() => {
    if (settings.mode === PRINT_MODE.BLUETOOTH) void restorePrinter();
  }, [settings.mode]);

  const state =
    settings.mode === PRINT_MODE.BLUETOOTH
      ? BLUETOOTH_CHIP[bluetooth.status]
      : settings.mode === PRINT_MODE.RAWBT
        ? RAWBT_CHIP
        : SYSTEM_CHIP;

  return (
    <Link
      href="/printer"
      title={`${state.label}: printer setup`}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold whitespace-nowrap',
        state.className,
        className,
      )}
    >
      <state.icon aria-hidden className="size-4 shrink-0" />
      <span>{state.label}</span>
    </Link>
  );
}

/**
 * "Reconnect printer" — one tap after a reload, a tablet sleep, or a printer
 * that was switched off and on.
 *
 * Needed because Chrome only reconnects silently when `getDevices()` is
 * available, and on a stock tablet it is not. A tap is a user gesture, which
 * is what the chooser needs. Shown only on a Bluetooth device that is not
 * connected, so a System-print laptop never sees it.
 *
 * Closable, and closed for good on this device once closed: the header chip
 * already says "Printer not connected" on every screen and leads to the
 * Printer screen's Reconnect button, so after the first time the bar is noise.
 */
export function PrinterReconnectBanner() {
  const settings = usePrinterSettings();
  const bluetooth = useBluetoothPrinter();
  const [error, setError] = useState<string | null>(null);

  if (settings.mode !== PRINT_MODE.BLUETOOTH || settings.reconnectBannerHidden) return null;
  if (bluetooth.status !== 'disconnected' && bluetooth.status !== 'lost') return null;

  async function handleReconnect() {
    setError(null);
    try {
      await reconnectPrinter();
    } catch (reason) {
      setError(describeBluetoothError(reason));
    }
  }

  return (
    <div className="border-status-cancelled/40 bg-status-cancelled-soft text-status-cancelled-ink print-hidden border-b">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-3 py-2 text-sm sm:px-4">
        <IconPrinterDisconnected aria-hidden className="size-4 shrink-0" />
        <p className="flex-1 font-medium">
          {bluetooth.deviceName
            ? `Printer “${bluetooth.deviceName}” is not connected.`
            : 'No printer connected.'}
          {error ? <span className="block font-normal">{error}</span> : null}
        </p>
        <Button size="sm" onClick={() => void handleReconnect()}>
          Reconnect printer
        </Button>
        <button
          type="button"
          onClick={() => writePrinterSettings({ reconnectBannerHidden: true })}
          aria-label="Hide this bar. The printer status stays in the header."
          title="Hide this bar. The printer status stays in the header."
          className="hover:bg-status-cancelled/10 min-h-touch min-w-touch flex items-center justify-center rounded-lg"
        >
          <IconClose aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  );
}
