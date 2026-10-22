/**
 * How *this device* prints — chosen once on the Printer screen, kept here.
 *
 * Per device, not per user or per café: the Windows laptop at the counter
 * prints through its driver and the Android tablet talks to the printer
 * directly, and whoever happens to be signed in on either does not change
 * that. So it lives in `localStorage`, which is per device by construction.
 *
 * It is a convenience, never a credential, and every read and write is wrapped:
 * storage can be blocked, full or wiped, and a missing or unreadable value
 * means **System** — today's behaviour — so a device nobody configured keeps
 * printing exactly as it always did.
 */

export const PRINT_MODE = {
  /** `window.print()` and the browser's dialog. Needs a driver (Windows). */
  SYSTEM: 'system',
  /** ESC/POS straight to a BLE printer over Web Bluetooth (Chrome / Edge). */
  BLUETOOTH: 'bluetooth',
  /** ESC/POS handed to the RawBT Android app, which owns the connection. */
  RAWBT: 'rawbt',
} as const;

export type PrintMode = (typeof PRINT_MODE)[keyof typeof PRINT_MODE];

/**
 * Characters per line on the direct path.
 *
 * 48 is Font A on 80mm paper (576 dots ÷ 12). 42 covers 80mm printers with a
 * narrower print head; 32 is a 58mm roll. The Printer screen's test print has
 * a ruler so the owner can see which one their printer actually fits.
 */
export const PAPER_CHARS = [48, 42, 32] as const;
export type PaperChars = (typeof PAPER_CHARS)[number];

export interface PrinterSettings {
  mode: PrintMode;
  paperChars: PaperChars;
  /** The Bluetooth printer last chosen — shown on screen, used to reconnect. */
  deviceName?: string;
  deviceId?: string;
  /**
   * The "Reconnect printer" bar was closed on this device. The header chip
   * still shows the printer's state on every screen, and the Printer screen
   * still has the Reconnect button, so the bar is a one-time nudge.
   */
  reconnectBannerHidden?: boolean;
}

export const STORAGE_KEY = 'acd.printer.v1';

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  mode: PRINT_MODE.SYSTEM,
  paperChars: 48,
};

const MODES: readonly string[] = Object.values(PRINT_MODE);

/** Anything unrecognised falls back field by field, never wholesale to an error. */
function parse(raw: string | null): PrinterSettings {
  if (!raw) return DEFAULT_PRINTER_SETTINGS;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return DEFAULT_PRINTER_SETTINGS;
    const record = value as Record<string, unknown>;

    const mode =
      typeof record.mode === 'string' && MODES.includes(record.mode)
        ? (record.mode as PrintMode)
        : DEFAULT_PRINTER_SETTINGS.mode;
    const paperChars = PAPER_CHARS.find((chars) => chars === record.paperChars);

    return {
      mode,
      paperChars: paperChars ?? DEFAULT_PRINTER_SETTINGS.paperChars,
      ...(typeof record.deviceName === 'string' ? { deviceName: record.deviceName } : {}),
      ...(typeof record.deviceId === 'string' ? { deviceId: record.deviceId } : {}),
      ...(record.reconnectBannerHidden === true ? { reconnectBannerHidden: true } : {}),
    };
  } catch {
    return DEFAULT_PRINTER_SETTINGS;
  }
}

/*
 * A tiny external store, so the header chip and the Printer screen see a change
 * the moment it is made. The snapshot is cached and only replaced on a write —
 * `useSyncExternalStore` requires a stable reference between changes.
 */
let cached: PrinterSettings | null = null;
const listeners = new Set<() => void>();

export function readPrinterSettings(): PrinterSettings {
  if (cached) return cached;
  let raw: string | null = null;
  try {
    raw = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  cached = parse(raw);
  return cached;
}

export function writePrinterSettings(patch: Partial<PrinterSettings>): PrinterSettings {
  const next: PrinterSettings = { ...readPrinterSettings(), ...patch };
  // `undefined` in a patch means "forget it", not "keep the key with no value".
  if (patch.deviceId === undefined && 'deviceId' in patch) delete next.deviceId;
  if (patch.deviceName === undefined && 'deviceName' in patch) delete next.deviceName;

  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the choice holds until the tab closes, which is
    // still better than refusing to change mode.
  }
  for (const listener of listeners) listener();
  return next;
}

export function subscribePrinterSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Server render and first paint: always System, so hydration never mismatches. */
export function serverPrinterSettings(): PrinterSettings {
  return DEFAULT_PRINTER_SETTINGS;
}

/** Tests only — forget the cached snapshot so the next read hits storage. */
export function resetPrinterSettingsCache(): void {
  cached = null;
}
