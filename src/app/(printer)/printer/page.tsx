import type { Metadata } from 'next';

import { PrinterClient } from './printer-client';

export const metadata: Metadata = { title: 'Printer' };

/**
 * How this device prints: System (the browser's dialog), Bluetooth (direct,
 * BLE printers in Chrome) or RawBT (the Android app). Reached from the printer
 * chip in the header. Entirely client-side — the choice lives on the device.
 */
export default function PrinterPage() {
  return <PrinterClient />;
}
