import { describe, expect, it } from 'vitest';

import { sameBill } from '@/hooks/use-table-bill';
import type { ConsolidatedBill, ConsolidatedLine } from '@/lib/types';

/**
 * "Is the bill on screen still the bill on the server?"
 *
 * The checkout asks this before it charges or prints, because the cached bill
 * is not re-read on every kitchen tick, cancel or moved bill. A false "same"
 * charges the wrong amount; a false "changed" blocks the counter for nothing.
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
    orderType: 'dining',
    rounds: [1],
    ...over,
  };
}

function bill(over: Partial<ConsolidatedBill> = {}): ConsolidatedBill {
  return {
    sessionId: 's1',
    tableCode: 'M4',
    sessionNumber: 1,
    openedAt: '2026-10-28T08:00:00.000Z',
    status: 'occupied',
    lines: [line()],
    cancelledLines: [],
    subtotal: 50,
    tax: 2.5,
    total: 53,
    roundOff: 0.5,
    roundCount: 1,
    itemCount: 2,
    orderTypes: ['dining'],
    requiresReview: false,
    kitchenPendingCount: 0,
    ...over,
  };
}

describe('sameBill', () => {
  it('ignores what does not change the money: kitchen progress, line order, rounds', () => {
    const tea = line();
    const samosa = line({ productCode: '210', quantity: 1, unitPrice: 30, amount: 30 });
    const before = bill({ lines: [tea, samosa], subtotal: 80, tax: 4, kitchenPendingCount: 3 });
    const after = bill({
      lines: [samosa, { ...tea, rounds: [1, 2] }],
      subtotal: 80,
      tax: 4,
      kitchenPendingCount: 0,
      status: 'bill_requested',
    });

    expect(sameBill(before, after)).toBe(true);
  });

  it('sees one more of something', () => {
    expect(
      sameBill(bill(), bill({ lines: [line({ quantity: 3 })], subtotal: 75, tax: 3.75 })),
    ).toBe(false);
  });

  it('sees a cancelled line drop off', () => {
    expect(sameBill(bill(), bill({ lines: [], subtotal: 0, tax: 0 }))).toBe(false);
  });

  it('sees two items swapped for two others at the same price', () => {
    const swapped = bill({ lines: [line({ productCode: '106' })] });
    expect(sameBill(bill(), swapped)).toBe(false);
  });
});
