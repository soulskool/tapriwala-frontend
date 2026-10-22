import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildReceiptText, ReceiptSheet } from '@/components/billing/receipt-sheet';
import { buildKotText } from '@/components/kitchen/kot-sheet';
import { formatDateTime } from '@/lib/utils';

import golden from './print-golden.json';
import { FIXTURES, KOT_FIXTURES } from './print-fixtures';

/**
 * The paper text, on both print paths.
 *
 * 1. **The HTML sheets did not change.** The Windows counter prints them
 *    through the browser, and the text builders were pulled out of the JSX so
 *    Bluetooth/RawBT could share them. `print-golden.json` is what the sheets
 *    rendered *before* that refactor; these tests hold them to it exactly.
 * 2. **No line is ever wider than its paper** — at 32 for the HTML sheet and
 *    at every width the direct path offers. A thermal printer drops what does
 *    not fit; the first live bills lost their GSTIN that way.
 */

type GoldenReceipt = { pres: string[]; total: string };
const GOLDEN = golden as unknown as Record<string, GoldenReceipt | string>;

const withDate = (text: string, iso: string) => text.replace('{{DATE}}', formatDateTime(iso));

function rendered(container: HTMLElement): GoldenReceipt {
  return {
    pres: [...container.querySelectorAll('pre')].map((pre) => pre.textContent ?? ''),
    total: container.querySelector('.receipt-total')?.textContent ?? '',
  };
}

function expected(name: string, printedAt: string): GoldenReceipt {
  const entry = GOLDEN[name] as GoldenReceipt;
  return { pres: entry.pres.map((pre) => withDate(pre, printedAt)), total: entry.total };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('HTML receipt is unchanged', () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    it(`renders the ${name} bill exactly as before`, () => {
      const { container } = render(<ReceiptSheet {...fixture} />);
      expect(rendered(container)).toEqual(expected(name, fixture.printedAt));
    });
  }

  it('renders a tax invoice exactly as before when a GSTIN is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOP_GSTIN', '27ABCDE1234F1Z5');
    vi.stubEnv('NEXT_PUBLIC_SHOP_PHONE', '9876543210');
    vi.resetModules();
    const fresh = await import('@/components/billing/receipt-sheet');

    for (const name of ['live', 'reprintMixed'] as const) {
      const fixture = FIXTURES[name];
      const { container, unmount } = render(<fresh.ReceiptSheet {...fixture} />);
      expect(rendered(container)).toEqual(expected(`gst_${name}`, fixture.printedAt));
      unmount();
    }
  });
});

describe('HTML KOT is unchanged', () => {
  for (const [name, kot] of Object.entries(KOT_FIXTURES)) {
    it(`builds the ${name} ticket exactly as before`, () => {
      expect(buildKotText(kot)).toBe(withDate(GOLDEN[`kot_${name}`] as string, kot.placedAt));
    });
  }
});

describe('no line is wider than the paper', () => {
  for (const width of [32, 42, 48]) {
    it(`receipt at ${width} characters`, () => {
      for (const fixture of Object.values(FIXTURES)) {
        const text = buildReceiptText(fixture, width);
        for (const line of [...text.body.split('\n'), ...text.foot.split('\n')]) {
          expect(line.length, `overflows ${width}: "${line}"`).toBeLessThanOrEqual(width);
        }
      }
    });

    it(`KOT at ${width} characters`, () => {
      for (const kot of Object.values(KOT_FIXTURES)) {
        for (const line of buildKotText(kot, width).split('\n')) {
          expect(line.length, `overflows ${width}: "${line}"`).toBeLessThanOrEqual(width);
        }
      }
    });
  }

  it('lays rules and the totals block to the full width it was asked for', () => {
    const text = buildReceiptText(FIXTURES.live, 48);
    const body = text.body.split('\n');
    expect(body).toContain('='.repeat(48));
    expect(body.find((line) => line.startsWith('SUBTOTAL'))).toHaveLength(48);
  });

  it('keeps big numbers in separate columns on the wider paper', () => {
    // At 32, a ₹8080 rate on a ₹96960 line runs its columns together. The
    // 48-column grid gives the numbers room, so the gap is back.
    const item = buildReceiptText(FIXTURES.reprintMixed, 48)
      .body.split('\n')
      .find((line) => line.startsWith('*JAIN'));
    expect(item).toMatch(/12\s+8080\.00\s+96960\.00$/);
  });

  it('lets a wider ticket keep more of a long dish name on its first row', () => {
    const first = (width: number) =>
      buildKotText(KOT_FIXTURES.addOn!, width)
        .split('\n')
        .find((line) => line.startsWith('Super'));
    expect(first(48)!.trimEnd().length).toBeGreaterThan(first(32)!.trimEnd().length);
    expect(first(48)).toMatch(/12$/);
  });
});
