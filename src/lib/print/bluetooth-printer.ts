import { readPrinterSettings, writePrinterSettings } from './print-settings';

/**
 * The café printer over Web Bluetooth — the same direct path the old POS app
 * uses, minus the app.
 *
 * Works in Chrome and Edge (Android, Windows, macOS) and only with printers
 * that speak **Bluetooth Low Energy**. A Classic-only (SPP) printer never
 * appears in the chooser at all; that device prints through RawBT instead.
 *
 * Held in module scope, not Redux: a `BluetoothDevice` is a live object, not
 * data, and is not serialisable. Next's client-side navigation keeps this
 * module alive, so moving between screens does not drop the printer. A full
 * reload does — see `restorePrinter`.
 */

// ─── The slice of Web Bluetooth this file uses ──────────────────────────────
// TypeScript's DOM library does not ship Web Bluetooth types. Declared here,
// narrowly, rather than pulling in a types package for six members.

interface BtCharacteristic {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}

interface BtService {
  uuid: string;
  getCharacteristics(): Promise<BtCharacteristic[]>;
}

interface BtServer {
  connected: boolean;
  connect(): Promise<BtServer>;
  disconnect(): void;
  getPrimaryServices(): Promise<BtService[]>;
}

interface BtDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BtServer;
}

interface BtApi {
  requestDevice(options: {
    acceptAllDevices: boolean;
    optionalServices: string[];
  }): Promise<BtDevice>;
  /** Behind `#enable-experimental-web-platform-features` in Chrome as of 2026-10. */
  getDevices?: () => Promise<BtDevice[]>;
}

function bluetoothApi(): BtApi | null {
  if (typeof navigator === 'undefined') return null;
  const api = (navigator as Navigator & { bluetooth?: BtApi }).bluetooth;
  return api ?? null;
}

// ─── Known printer services ─────────────────────────────────────────────────

/**
 * GATT services cheap thermal printers expose for print data.
 *
 * Web Bluetooth only lets a page touch services named up front, so the chooser
 * must be opened with every likely one. These cover the common Chinese
 * modules most 58/80mm BLE printers ship with. If the café's BPOS turns out
 * to use another, nRF Connect shows its UUID and it goes on this list.
 */
export const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
];

/**
 * Bytes per write.
 *
 * 20 is the payload of the smallest BLE packet, so it works on every printer.
 * Slow-ish — a bill is around a hundred writes — but a printer flooded with
 * larger ones drops data and prints half a bill, which is worse.
 */
export const CHUNK_SIZE = 20;

// ─── State ──────────────────────────────────────────────────────────────────

export type BluetoothStatus =
  | 'unsupported'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  /** Was connected this session and dropped; one tap brings it back. */
  | 'lost';

export interface BluetoothSnapshot {
  status: BluetoothStatus;
  deviceName: string | null;
  /** True when Chrome can reconnect after a reload without a tap. */
  canRestoreSilently: boolean;
}

let device: BtDevice | null = null;
let characteristic: BtCharacteristic | null = null;
let manualDisconnect = false;
let restoreAttempted = false;

const SERVER_SNAPSHOT: BluetoothSnapshot = {
  status: 'disconnected',
  deviceName: null,
  canRestoreSilently: false,
};

let snapshot: BluetoothSnapshot = SERVER_SNAPSHOT;
let initialised = false;
const listeners = new Set<() => void>();

function setSnapshot(patch: Partial<BluetoothSnapshot>): void {
  ensureInitialised();
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

function ensureInitialised(): void {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;
  const api = bluetoothApi();
  snapshot = {
    status: api ? 'disconnected' : 'unsupported',
    deviceName: readPrinterSettings().deviceName ?? null,
    canRestoreSilently: Boolean(api?.getDevices),
  };
}

export function getBluetoothSnapshot(): BluetoothSnapshot {
  ensureInitialised();
  return snapshot;
}

export function getServerBluetoothSnapshot(): BluetoothSnapshot {
  return SERVER_SNAPSHOT;
}

export function subscribeBluetooth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isBluetoothSupported(): boolean {
  return bluetoothApi() !== null;
}

// ─── Errors staff can act on ────────────────────────────────────────────────

export class PrinterError extends Error {
  override name = 'PrinterError';
}

/**
 * Turns a Web Bluetooth failure into a sentence for the counter.
 *
 * The browser's own messages ("GATT operation failed for unknown reason") mean
 * nothing to the person holding a guest's bill. The one cause worth naming
 * every time: the printer talks to one device at a time, so the old POS app
 * or RawBT holding it looks exactly like a broken printer.
 */
export function describeBluetoothError(error: unknown): string {
  if (error instanceof PrinterError) return error.message;
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotFoundError') {
    return 'No printer was chosen. If your printer is not in the list, it may be Classic Bluetooth only. Use RawBT instead (see the Printer screen).';
  }
  if (name === 'SecurityError') {
    return 'Chrome blocked Bluetooth on this page. Open the site in Chrome over https and try again.';
  }
  if (name === 'NotSupportedError') {
    return 'This printer does not offer a print channel over Bluetooth Low Energy. Use RawBT instead.';
  }
  return 'Could not reach the printer. Check it is switched on and close the old POS app or RawBT. The printer talks to only one device at a time.';
}

// ─── Connecting ─────────────────────────────────────────────────────────────

/** The first writable characteristic, trying known printer services first. */
async function findWritable(server: BtServer): Promise<BtCharacteristic> {
  const services = await server.getPrimaryServices();
  const rank = (uuid: string) => {
    const index = PRINTER_SERVICES.indexOf(uuid.toLowerCase());
    return index === -1 ? PRINTER_SERVICES.length : index;
  };
  services.sort((a, b) => rank(a.uuid) - rank(b.uuid));

  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    const writable = characteristics.find(
      (candidate) => candidate.properties.write || candidate.properties.writeWithoutResponse,
    );
    if (writable) return writable;
  }
  throw new PrinterError(
    'Connected, but this printer offers no print channel the website recognises. Use RawBT instead.',
  );
}

function onDisconnected(): void {
  characteristic = null;
  if (manualDisconnect) return;
  setSnapshot({ status: 'lost' });
  void retryWithBackoff();
}

/**
 * Comes back on its own after a blip — the printer was switched off and on,
 * or the tablet walked out of range for a moment. Three tries, then it waits
 * for a tap on "Reconnect printer".
 */
async function retryWithBackoff(): Promise<void> {
  for (const delay of [1_000, 3_000, 8_000]) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (manualDisconnect || !device || characteristic) return;
    try {
      await attach(device);
      return;
    } catch {
      // Next attempt.
    }
  }
}

async function attach(next: BtDevice): Promise<void> {
  if (!next.gatt) throw new PrinterError('This Bluetooth device cannot be printed to.');
  if (device !== next) {
    device?.removeEventListener('gattserverdisconnected', onDisconnected);
    next.addEventListener('gattserverdisconnected', onDisconnected);
    device = next;
  }
  manualDisconnect = false;
  setSnapshot({ status: 'connecting', deviceName: next.name ?? 'Printer' });
  try {
    const server = await next.gatt.connect();
    characteristic = await findWritable(server);
    setSnapshot({ status: 'connected' });
  } catch (error) {
    characteristic = null;
    setSnapshot({ status: 'lost' });
    throw error;
  }
}

/**
 * Opens Chrome's device chooser and connects to what the owner picks.
 *
 * **Must run inside a tap** — `requestDevice` refuses otherwise — so nothing
 * may be awaited before it.
 */
export async function choosePrinter(): Promise<void> {
  const api = bluetoothApi();
  if (!api) throw new PrinterError('This browser has no Bluetooth. Use Chrome, or choose RawBT.');
  const picked = await api.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });
  writePrinterSettings({ deviceId: picked.id, deviceName: picked.name ?? 'Printer' });
  await attach(picked);
}

/**
 * Reconnects after a reload without a tap, where Chrome allows it.
 *
 * `navigator.bluetooth.getDevices()` returns printers this site was allowed
 * before — but in Chrome it is still behind the experimental-features flag,
 * so on most tablets this does nothing and the header shows "Reconnect
 * printer" instead. Attempted once per page load.
 */
export async function restorePrinter(): Promise<void> {
  ensureInitialised();
  if (restoreAttempted || device) return;
  restoreAttempted = true;

  const api = bluetoothApi();
  const { deviceId } = readPrinterSettings();
  if (!api?.getDevices || !deviceId) return;

  try {
    const known = await api.getDevices();
    const saved = known.find((candidate) => candidate.id === deviceId);
    if (saved) await attach(saved);
  } catch {
    // Not fatal: the header offers the one-tap reconnect.
  }
}

/**
 * Reconnects from a tap: the held device if there is one, else the chooser.
 * Safe as the first thing in a click handler.
 */
export async function reconnectPrinter(): Promise<void> {
  if (device) {
    await attach(device);
    return;
  }
  await choosePrinter();
}

export async function forgetPrinter(): Promise<void> {
  manualDisconnect = true;
  characteristic = null;
  device?.removeEventListener('gattserverdisconnected', onDisconnected);
  device?.gatt?.disconnect();
  device = null;
  writePrinterSettings({ deviceId: undefined, deviceName: undefined });
  setSnapshot({
    status: isBluetoothSupported() ? 'disconnected' : 'unsupported',
    deviceName: null,
  });
}

// ─── Printing ───────────────────────────────────────────────────────────────

/**
 * Sends one job, connecting first if needed.
 *
 * Called from the Print tap. If nothing is held yet (a fresh page load with no
 * `getDevices`), the chooser opens right there — still inside the tap — so
 * the first print after a reload is "Print, pick printer", not "go to the
 * Printer screen first".
 */
export async function printOverBluetooth(bytes: Uint8Array): Promise<void> {
  if (!characteristic) {
    if (device) await attach(device);
    else await choosePrinter();
  }
  const target = characteristic;
  if (!target) throw new PrinterError('The printer is not connected.');

  // With-response where offered: each chunk is acknowledged before the next,
  // which is the flow control a small printer buffer needs.
  const withResponse = target.properties.write;
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + CHUNK_SIZE);
    if (withResponse) {
      await target.writeValueWithResponse(chunk);
    } else {
      await target.writeValueWithoutResponse(chunk);
      // No acknowledgement to wait on — give the buffer a moment instead.
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }
}
