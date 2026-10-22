import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FIXTURES } from './print-fixtures';

/**
 * Which way a Print tap goes, and what happens when the direct way fails.
 *
 * The promise worth testing is the one the Windows counter depends on: a
 * device nobody configured — or whose storage is broken — prints exactly as
 * it always did, through `window.print()`. And when Bluetooth fails, the
 * counter is always offered the system dialog instead of being left stuck.
 */

const printOverBluetooth = vi.fn<(bytes: Uint8Array) => Promise<void>>();

vi.mock('@/lib/print/bluetooth-printer', () => ({
  printOverBluetooth: (bytes: Uint8Array) => printOverBluetooth(bytes),
  describeBluetoothError: () => 'Could not reach the printer.',
}));

const job = { kind: 'receipt' as const, receipt: FIXTURES.live };

async function load() {
  const settings = await import('@/lib/print/print-settings');
  const document = await import('@/lib/print/print-document');
  settings.resetPrinterSettingsCache();
  return { settings, document };
}

beforeEach(() => {
  window.localStorage.clear();
  printOverBluetooth.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('printer settings', () => {
  it('defaults to System print with nothing stored', async () => {
    const { settings } = await load();
    expect(settings.readPrinterSettings()).toEqual({ mode: 'system', paperChars: 48 });
  });

  it('falls back to System on a corrupt or unknown value', async () => {
    const { settings } = await load();
    window.localStorage.setItem(settings.STORAGE_KEY, '{not json');
    expect(settings.readPrinterSettings().mode).toBe('system');

    settings.resetPrinterSettingsCache();
    window.localStorage.setItem(
      settings.STORAGE_KEY,
      JSON.stringify({ mode: 'laser', paperChars: 99 }),
    );
    expect(settings.readPrinterSettings()).toEqual({ mode: 'system', paperChars: 48 });
  });

  it('falls back to System when storage itself throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { settings } = await load();
    expect(settings.readPrinterSettings().mode).toBe('system');
  });

  it('remembers a choice, and still changes mode when storage refuses to save it', async () => {
    const { settings } = await load();
    settings.writePrinterSettings({ mode: 'bluetooth', deviceId: 'abc', deviceName: 'BPOS' });
    settings.resetPrinterSettingsCache();
    expect(settings.readPrinterSettings()).toMatchObject({ mode: 'bluetooth', deviceId: 'abc' });

    settings.writePrinterSettings({ deviceId: undefined, deviceName: undefined });
    expect(settings.readPrinterSettings()).toEqual({ mode: 'bluetooth', paperChars: 48 });

    // Closing the reconnect bar is remembered across a reload.
    settings.writePrinterSettings({ reconnectBannerHidden: true });
    settings.resetPrinterSettingsCache();
    expect(settings.readPrinterSettings().reconnectBannerHidden).toBe(true);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(settings.writePrinterSettings({ mode: 'rawbt' }).mode).toBe('rawbt');
  });
});

describe('printDocument', () => {
  it('runs the system print path in System mode and nothing else', async () => {
    const { document } = await load();
    const systemPrint = vi.fn();
    document.printDocument(job, systemPrint);
    expect(systemPrint).toHaveBeenCalledOnce();
    expect(printOverBluetooth).not.toHaveBeenCalled();
  });

  it('sends ESC/POS over Bluetooth in Bluetooth mode, at the chosen width', async () => {
    const { settings, document } = await load();
    settings.writePrinterSettings({ mode: 'bluetooth', paperChars: 42 });
    printOverBluetooth.mockResolvedValue();
    const systemPrint = vi.fn();

    document.printDocument(job, systemPrint);
    await vi.waitFor(() => expect(document.getPrintNotice()?.tone).toBe('sent'));

    expect(systemPrint).not.toHaveBeenCalled();
    const bytes = printOverBluetooth.mock.calls[0]![0];
    expect([...bytes.slice(0, 2)]).toEqual([0x1b, 0x40]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('='.repeat(42));
    expect(text).not.toContain('='.repeat(43));
  });

  it('offers the system dialog when Bluetooth fails, and uses it on request', async () => {
    const { settings, document } = await load();
    settings.writePrinterSettings({ mode: 'bluetooth' });
    printOverBluetooth.mockRejectedValue(new Error('GATT operation failed'));
    const systemPrint = vi.fn();

    document.printDocument(job, systemPrint);
    await vi.waitFor(() => expect(document.getPrintNotice()?.tone).toBe('failed'));
    expect(systemPrint).not.toHaveBeenCalled();

    const notice = document.getPrintNotice();
    if (notice?.tone !== 'failed') throw new Error('expected a failure notice');
    expect(notice.message).toBe('Could not reach the printer.');
    notice.fallback();
    expect(systemPrint).toHaveBeenCalledOnce();
    expect(document.getPrintNotice()).toBeNull();
  });

  it('hands the job to RawBT synchronously, inside the tap', async () => {
    const { settings, document } = await load();
    settings.writePrinterSettings({ mode: 'rawbt' });

    let opened = '';
    const location = { href: '' };
    Object.defineProperty(location, 'href', {
      set: (value: string) => {
        opened = value;
      },
      get: () => opened,
    });
    vi.spyOn(window, 'location', 'get').mockReturnValue(location as Location);

    const systemPrint = vi.fn();
    document.printDocument(job, systemPrint);

    // No await above: the app link must be opened in the same tick as the tap.
    expect(opened).toMatch(
      /^intent:base64,[A-Za-z0-9+/=]+#Intent;scheme=rawbt;package=ru\.a402d\.rawbtprinter;end;$/,
    );
    expect(systemPrint).not.toHaveBeenCalled();
  });
});
