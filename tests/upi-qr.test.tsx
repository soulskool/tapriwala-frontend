import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ReceiptSheet } from '@/components/billing/receipt-sheet';
import { encodeJob } from '@/lib/print/print-jobs';
import {
  readPrinterSettings,
  resetPrinterSettingsCache,
  STORAGE_KEY,
  upiQrMode,
  writePrinterSettings,
} from '@/lib/print/print-settings';
import {
  emvCrc,
  isValidEmvQr,
  qrModules,
  receiptUpiQr,
  SHOP_UPI_QR,
  upiQrForAmount,
} from '@/lib/print/upi-qr';

import { FIXTURES } from './print-fixtures';

/**
 * The "Scan & Pay" QR under a bill's total.
 *
 * What matters most is that the money still reaches the café: every field
 * HDFC put in the standee QR survives untouched, only the amount is added,
 * and the checksum is honest. A source that fails its own checksum must print
 * no QR at all — sealing a typo under a fresh CRC would pay somewhere wrong.
 */

const GS = 0x1d;

/** Top-level `tag → value` of an EMV payload. */
function fields(text: string): Map<string, string> {
  const out = new Map<string, string>();
  let index = 0;
  while (index < text.length) {
    const length = Number(text.slice(index + 2, index + 4));
    out.set(text.slice(index, index + 2), text.slice(index + 4, index + 4 + length));
    index += 4 + length;
  }
  return out;
}

/** The text stored by a `GS ( k … 1 P 0` command in a print job, if any. */
function storedQr(bytes: Uint8Array): string | null {
  for (let index = 0; index < bytes.length - 8; index += 1) {
    if (
      bytes[index] === GS &&
      bytes[index + 1] === 0x28 &&
      bytes[index + 2] === 0x6b &&
      bytes[index + 5] === 0x31 &&
      bytes[index + 6] === 0x50
    ) {
      const length = bytes[index + 3]! + bytes[index + 4]! * 256 - 3;
      return String.fromCharCode(...bytes.slice(index + 8, index + 8 + length));
    }
  }
  return null;
}

afterEach(() => {
  window.localStorage.removeItem(STORAGE_KEY);
  resetPrinterSettingsCache();
});

describe('the café QR', () => {
  it('is the standee text, intact: its own checksum matches', () => {
    expect(isValidEmvQr(SHOP_UPI_QR)).toBe(true);
    expect(fields(SHOP_UPI_QR).get('26')).toContain('vyapar.178423020978@hdfcbank');
  });

  it('adds the amount and keeps every HDFC field as it was', () => {
    const qr = upiQrForAmount(245)!;
    const before = fields(SHOP_UPI_QR);
    const after = fields(qr);

    expect(after.get('01')).toBe('12');
    expect(after.get('54')).toBe('245.00');
    for (const [tag, value] of before) {
      if (tag === '01' || tag === '63') continue;
      expect(after.get(tag), `tag ${tag}`).toBe(value);
    }
    // Ascending tag order, and an honest checksum over the new text.
    expect([...after.keys()]).toEqual([...after.keys()].sort());
    expect(after.get('63')).toBe(emvCrc(qr.slice(0, -4)));
    expect(isValidEmvQr(qr)).toBe(true);
  });

  it('carries paise when the bill has them', () => {
    expect(fields(upiQrForAmount(99.5)!).get('54')).toBe('99.50');
  });

  it('prints nothing for a source with a mistyped digit', () => {
    const typo = SHOP_UPI_QR.replace('178423020978', '178423020979');
    expect(isValidEmvQr(typo)).toBe(false);
    expect(upiQrForAmount(245, typo)).toBeNull();
  });

  it('prints nothing when there is nothing to pay', () => {
    expect(upiQrForAmount(0)).toBeNull();
    expect(upiQrForAmount(-5)).toBeNull();
    expect(upiQrForAmount(Number.NaN)).toBeNull();
  });

  it('is left off a paid bill and when switched off', () => {
    expect(receiptUpiQr({ bill: { total: 245 } }, 'amount')).not.toBeNull();
    expect(receiptUpiQr({ bill: { total: 245 }, settled: true }, 'amount')).toBeNull();
    expect(receiptUpiQr({ bill: { total: 245 }, settled: true }, 'standee')).toBeNull();
    expect(receiptUpiQr({ bill: { total: 245 } }, 'off')).toBeNull();
  });

  it('with the amount switched off, is the standee QR exactly', () => {
    expect(receiptUpiQr({ bill: { total: 245 } }, 'standee')).toBe(SHOP_UPI_QR);
    expect(receiptUpiQr({ bill: { total: 0 } }, 'standee')).toBeNull();
  });

  it('draws a real QR symbol: square, with the three finder squares', () => {
    const modules = qrModules(upiQrForAmount(245)!);
    const size = modules.length;
    expect(size).toBeGreaterThanOrEqual(21);
    expect((size - 17) % 4).toBe(0); // 4 × version + 17
    const finderAt = (top: number, left: number) =>
      [0, 6].every(
        (edge) =>
          modules[top + edge]!.slice(left, left + 7).every(Boolean) &&
          modules.slice(top, top + 7).every((row) => row[left + edge]),
      );
    expect(finderAt(0, 0)).toBe(true);
    expect(finderAt(0, size - 7)).toBe(true);
    expect(finderAt(size - 7, 0)).toBe(true);
  });
});

describe('the switches', () => {
  it('are both on for a device nobody configured', () => {
    expect(upiQrMode(readPrinterSettings())).toBe('amount');
  });

  it('remember off across a reload', () => {
    writePrinterSettings({ upiQrAmount: false });
    resetPrinterSettingsCache();
    expect(upiQrMode(readPrinterSettings())).toBe('standee');

    writePrinterSettings({ upiQr: false });
    resetPrinterSettingsCache();
    expect(upiQrMode(readPrinterSettings())).toBe('off');
  });
});

describe('on paper', () => {
  const receipt = FIXTURES.live;

  it('direct printing sends the QR as a printer command with the bill amount', () => {
    const qr = storedQr(encodeJob({ kind: 'receipt', receipt }, 48, { upiQr: 'amount' }));
    expect(qr).toBe(upiQrForAmount(receipt.bill.total));
  });

  it('direct printing leaves it off when switched off or paid', () => {
    expect(storedQr(encodeJob({ kind: 'receipt', receipt }, 48))).toBeNull();
    expect(
      storedQr(
        encodeJob({ kind: 'receipt', receipt: { ...receipt, settled: true } }, 48, {
          upiQr: 'amount',
        }),
      ),
    ).toBeNull();
  });

  it('direct printing sends the plain standee QR when the amount is off', () => {
    const bytes = encodeJob({ kind: 'receipt', receipt }, 48, { upiQr: 'standee' });
    expect(storedQr(bytes)).toBe(SHOP_UPI_QR);
    expect(String.fromCharCode(...bytes)).toContain(`SCAN, ENTER Rs.${receipt.bill.total} & PAY`);
  });

  it('the test print carries the standee QR so the printer can be checked', () => {
    const bytes = encodeJob(
      { kind: 'test', modeLabel: 'Bluetooth', printedAt: '2026-11-02T10:00:00.000Z' },
      48,
      { upiQr: 'amount' },
    );
    expect(storedQr(bytes)).toBe(SHOP_UPI_QR);
  });

  it('the browser sheet draws it above the thank-you line', () => {
    const { container } = render(<ReceiptSheet {...receipt} />);
    const pres = [...container.querySelectorAll('pre')].map((pre) => pre.textContent ?? '');

    expect(container.querySelector('svg.receipt-qr')).not.toBeNull();
    expect(container.querySelector('.receipt-qr-caption')?.textContent).toContain('SCAN & PAY');
    expect(pres.at(-1)).toContain('THANK YOU');
    expect(pres.at(-2)).not.toContain('THANK YOU');
  });

  it('the browser sheet tells the guest what to type when the amount is off', () => {
    writePrinterSettings({ upiQrAmount: false });
    const { container } = render(<ReceiptSheet {...receipt} />);
    expect(container.querySelector('.receipt-qr-caption')?.textContent).toBe(
      `SCAN, ENTER Rs.${receipt.bill.total} & PAY`,
    );
  });

  it('the browser sheet has no QR on a paid bill or when switched off', () => {
    const paid = render(<ReceiptSheet {...receipt} settled />);
    expect(paid.container.querySelector('svg.receipt-qr')).toBeNull();
    paid.unmount();

    writePrinterSettings({ upiQr: false });
    const off = render(<ReceiptSheet {...receipt} />);
    expect(off.container.querySelector('svg.receipt-qr')).toBeNull();
  });
});
