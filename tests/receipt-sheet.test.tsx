import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ConsolidatedBill, ConsolidatedLine } from '@/lib/types';
import { ReceiptSheet } from '@/components/billing/receipt-sheet';

/**
 * The 80mm thermal receipt.
 *
 * Two things are worth a test here and nothing else is:
 *
 *   1. **The 32-character grid.** 72mm of printable width at 10.5pt monospace
 *      fits exactly 32 characters. One over and the printer wraps the line,
 *      which turns a tidy column of prices into two ragged ones — and you only
 *      find out on paper, in front of a guest. Screen rendering never shows it.
 *   2. **The money.** A receipt that prints the wrong total is a dispute at the
 *      counter.
 *
 * Nothing below asserts on wording, headings or styling. The shop name, the
 * footer and the "not a tax invoice" wording are all expected to change.
 */

function line(over: Partial<ConsolidatedLine> = {}): ConsolidatedLine {
  return {
    productCode: '105',
    posName: 'TW CUTT TEA',
    displayName: 'Plain Tea Cutting',
    quantity: 2,
    unitPrice: 25,
    taxPercent: 5,
    amount: 50,
    taxAmount: 2.5,
    kitchenStation: 'Beverage',
    rounds: [1],
    ...over,
  };
}

function bill(over: Partial<ConsolidatedBill> = {}): ConsolidatedBill {
  return {
    sessionId: 's1',
    tableCode: 'O3',
    sessionNumber: 1,
    openedAt: '2026-09-03T09:57:35.139Z',
    status: 'bill_requested',
    lines: [line()],
    cancelledLines: [],
    subtotal: 50,
    tax: 2.5,
    total: 52.5,
    roundCount: 1,
    itemCount: 2,
    requiresReview: false,
    ...over,
  };
}

/** Every text line the printer would actually feed. */
function printedLines(container: HTMLElement): string[] {
  return [...container.querySelectorAll('pre')]
    .flatMap((pre) => (pre.textContent ?? '').split('\n'))
    .filter((text) => text.length > 0);
}

const PAPER_WIDTH = 32;

describe('ReceiptSheet paper width', () => {
  it('never emits a line wider than the paper', () => {
    const { container } = render(
      <ReceiptSheet bill={bill()} billNumber={123} printedAt="2026-09-03T11:20:00.000Z" />,
    );

    for (const text of printedLines(container)) {
      expect(text.length, `overflows ${PAPER_WIDTH} chars: "${text}"`).toBeLessThanOrEqual(
        PAPER_WIDTH,
      );
    }
  });

  it('truncates a long product name instead of wrapping it', () => {
    // POS names run to 16+ characters; the name column is 14. Truncating keeps
    // the price column aligned, wrapping destroys it.
    const { container } = render(
      <ReceiptSheet
        bill={bill({ lines: [line({ posName: 'PANEER TIKKA SANDWICH GRILLED' })] })}
        printedAt="2026-09-03T11:20:00.000Z"
      />,
    );

    for (const text of printedLines(container)) {
      expect(text.length).toBeLessThanOrEqual(PAPER_WIDTH);
    }
  });

  it('holds the grid with the widest realistic numbers', () => {
    // The sheet contains a ₹8080 item and a ₹1001 one; a four-figure rate and
    // a five-figure total must still fit.
    const { container } = render(
      <ReceiptSheet
        bill={bill({
          lines: [
            line({ posName: 'JAIN CHESSE FF', quantity: 12, unitPrice: 8080, amount: 96960 }),
          ],
          subtotal: 96960,
          tax: 4848,
          total: 101808,
        })}
        billNumber={123}
        printedAt="2026-09-03T11:20:00.000Z"
      />,
    );

    for (const text of printedLines(container)) {
      expect(text.length, `overflows: "${text}"`).toBeLessThanOrEqual(PAPER_WIDTH);
    }
  });
});

describe('ReceiptSheet content', () => {
  const printedAt = '2026-09-03T11:20:00.000Z';

  it('prints the POS name, not the customer-facing menu name', () => {
    // This is the line the counter reconciles against the café's own software.
    const { container } = render(<ReceiptSheet bill={bill()} printedAt={printedAt} />);
    const text = container.textContent ?? '';

    expect(text).toContain('TW CUTT TEA');
    expect(text).not.toContain('Plain Tea Cutting');
  });

  it('prints the totals it was given', () => {
    const { container } = render(
      <ReceiptSheet bill={bill({ subtotal: 100, tax: 5, total: 105 })} printedAt={printedAt} />,
    );
    const text = container.textContent ?? '';

    expect(text).toContain('100.00');
    expect(text).toContain('105.00');
  });

  it('splits tax half to CGST and half to SGST', () => {
    const { container } = render(
      <ReceiptSheet
        bill={bill({ lines: [line({ amount: 100, taxAmount: 5 })], subtotal: 100, tax: 5 })}
        printedAt={printedAt}
      />,
    );
    // The tax-summary row starts with the rate; the item row starts with a
    // name, so anchoring on "5.00 " picks the summary and not the line above.
    const taxLine = printedLines(container).find((text) => /^5\.00\s/.test(text));
    expect(taxLine, 'no tax-summary row found').toBeDefined();

    // 5.00 of tax => 2.50 CGST + 2.50 SGST.
    expect(taxLine?.match(/2\.50/g)).toHaveLength(2);
  });

  it('groups the tax summary by rate, one row per distinct rate', () => {
    // The item sheet genuinely contains 0% and 5% items, so a bill can mix them
    // and a single hardcoded 5% row would be wrong.
    const { container } = render(
      <ReceiptSheet
        bill={bill({
          lines: [
            line({ taxPercent: 5, amount: 100, taxAmount: 5 }),
            line({ productCode: '999', posName: 'WATER', taxPercent: 0, amount: 20, taxAmount: 0 }),
          ],
          subtotal: 120,
          tax: 5,
          total: 125,
        })}
        printedAt={printedAt}
      />,
    );

    const rows = printedLines(container).filter((text) => /^(0|5)\.00\s/.test(text));
    expect(rows).toHaveLength(2);
  });

  it('says so plainly when no bill number has been generated yet', () => {
    // A preview must never look like a numbered bill.
    const { container } = render(<ReceiptSheet bill={bill()} printedAt={printedAt} />);
    expect(container.textContent).toContain('not generated');
  });

  it('marks a reprint as a duplicate', () => {
    // Two identical-looking receipts for one payment is how a cashier gets
    // accused of pocketing a bill.
    const { container } = render(
      <ReceiptSheet bill={bill()} billNumber={123} printedAt={printedAt} isReprint />,
    );
    expect(container.textContent).toContain('DUPLICATE');
  });

  it('omits cancelled lines from the printed bill', () => {
    const { container } = render(
      <ReceiptSheet
        bill={bill({ cancelledLines: [line({ posName: 'CANCELLED ITEM' })] })}
        printedAt={printedAt}
      />,
    );
    expect(container.textContent).not.toContain('CANCELLED ITEM');
  });
});
