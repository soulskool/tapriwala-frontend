import type { KotData } from '@/components/kitchen/kot-sheet';

/**
 * Bills and tickets shared by the paper tests.
 *
 * `print-golden.json` holds the exact text the HTML sheets rendered for each of
 * these on 2026-10-19, captured *before* the text builders were pulled out of
 * the JSX for the direct-to-printer path. The Windows counter prints that HTML,
 * so it must stay character-for-character what it was. Change a fixture and
 * the golden file is wrong — re-capture it from a known-good build, never by
 * pasting in whatever the new code produces.
 */

const tea = {
  posName: 'TW CUTT TEA',
  quantity: 2,
  unitPrice: 25,
  taxPercent: 5,
  amount: 50,
  taxAmount: 2.5,
};

export const FIXTURES = {
  /** A live table at the counter: generated bill, rounded up. */
  live: {
    bill: {
      tableCode: 'O3',
      sessionNumber: 7,
      orderTypes: ['dining' as const],
      lines: [
        { ...tea, orderType: 'dining' as const },
        {
          posName: 'PANEER TIKKA SANDWICH GRILLED',
          quantity: 1,
          unitPrice: 180,
          taxPercent: 5,
          amount: 180,
          taxAmount: 9,
          orderType: 'dining' as const,
        },
        {
          posName: 'WATER',
          quantity: 1,
          unitPrice: 20,
          taxPercent: 0,
          amount: 20,
          taxAmount: 0,
          orderType: 'dining' as const,
        },
      ],
      subtotal: 250,
      tax: 11.5,
      roundOff: 0.5,
      total: 262,
    },
    billNumber: 1234,
    printedAt: '2026-09-03T11:20:00.000Z',
  },
  /** Dining + parcel on one bill, reprinted from Billed, rounded down. */
  reprintMixed: {
    bill: {
      tableCode: 'M2',
      lines: [
        { ...tea, orderType: 'dining' as const },
        {
          posName: 'JAIN CHESSE FF',
          quantity: 12,
          unitPrice: 8080,
          taxPercent: 5,
          amount: 96960,
          taxAmount: 4848,
          orderType: 'parcel' as const,
        },
      ],
      orderTypes: ['dining' as const, 'parcel' as const],
      subtotal: 97010,
      tax: 4850.5,
      roundOff: -0.5,
      total: 101860,
    },
    billNumber: 98765,
    printedAt: '2026-10-08T15:45:00.000Z',
    isReprint: true,
  },
  /** A bill saved before order types and rounding existed; no number yet. */
  legacy: {
    bill: { tableCode: 'R1', lines: [tea], subtotal: 50, tax: 2.5, total: 52.5 },
    printedAt: '2026-08-01T06:05:00.000Z',
  },
};

export const KOT_FIXTURES: Record<string, KotData> = {
  addOn: {
    kotId: '1051',
    tableCode: 'M2',
    orderType: 'parcel',
    roundNumber: 2,
    isAddOn: true,
    placedAt: '2026-10-08T07:30:00.000Z',
    placedByName: 'Ravi',
    items: [
      {
        displayName: 'Plain Tea Cutting',
        quantity: 2,
        specialInstructions: 'less sugar, extra hot, served in a glass please',
        status: 'pending',
      },
      {
        displayName: 'Veg Sandwich',
        quantity: 1,
        specialInstructions: '',
        status: 'cancelled',
      },
      {
        displayName: 'Supercalifragilisticexpialidocious Masala Maggi With Cheese',
        quantity: 12,
        specialInstructions: '',
        status: 'preparing',
      },
    ],
  },
  guestFirstRound: {
    kotId: '1052',
    tableCode: 'O1',
    orderType: 'dining',
    roundNumber: 1,
    isAddOn: false,
    placedAt: '2026-10-08T08:00:00.000Z',
    placedByName: '',
    items: [
      { displayName: 'Cold Coffee', quantity: 3, specialInstructions: '', status: 'pending' },
    ],
  },
};
