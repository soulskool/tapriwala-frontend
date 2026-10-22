'use client';

import { useSyncExternalStore } from 'react';

import {
  getBluetoothSnapshot,
  getServerBluetoothSnapshot,
  subscribeBluetooth,
  type BluetoothSnapshot,
} from '@/lib/print/bluetooth-printer';
import {
  getPrintNotice,
  getServerPrintNotice,
  subscribePrintNotice,
  type PrintNotice,
} from '@/lib/print/print-document';
import {
  readPrinterSettings,
  serverPrinterSettings,
  subscribePrinterSettings,
  type PrinterSettings,
} from '@/lib/print/print-settings';

/**
 * This device's print setup and the printer's live state.
 *
 * External stores rather than Redux: the settings belong to the device's
 * storage and the connection is a live Bluetooth object — neither is app
 * state. The server snapshot is always "System, not connected", so the first
 * paint matches the server render and the real value arrives right after.
 */
export function usePrinterSettings(): PrinterSettings {
  return useSyncExternalStore(subscribePrinterSettings, readPrinterSettings, serverPrinterSettings);
}

export function useBluetoothPrinter(): BluetoothSnapshot {
  return useSyncExternalStore(subscribeBluetooth, getBluetoothSnapshot, getServerBluetoothSnapshot);
}

export function usePrintNotice(): PrintNotice | null {
  return useSyncExternalStore(subscribePrintNotice, getPrintNotice, getServerPrintNotice);
}
