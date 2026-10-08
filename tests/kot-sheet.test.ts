import { describe, expect, it } from 'vitest';

import { buildKotText, kotFromRound, type KotData } from '@/components/kitchen/kot-sheet';
import type { OrderItem, OrderRound } from '@/lib/types';

/**
 * The KOT printed from the waiter's floor screen.
 *
 * One promise is worth a test: the waiter's docket and the kitchen board's
 * reprint of the same round are the same characters. The floor maps an
 * `OrderRound`, the board maps a `KdsTicket`; if the two mappings drift, the
 * kitchen gets two different pieces of paper for one order.
 */

function item(over: Partial<OrderItem> = {}): OrderItem {
  return {
    _id: 'i1',
    productCode: '105',
    posName: 'TW CUTT TEA',
    displayName: 'Plain Tea Cutting',
    quantity: 2,
    unitPrice: 25,
    taxPercent: 5,
    specialInstructions: 'less sugar',
    kitchenStation: 'Beverage',
    status: 'pending',
    lineTotal: 50,
    ...over,
  };
}

function round(over: Partial<OrderRound> = {}): OrderRound {
  return {
    _id: 'r1',
    sessionId: 's1',
    tableId: 't1',
    tableCode: 'M2',
    roundNumber: 2,
    source: 'waiter',
    orderType: 'parcel',
    placedBy: { role: 'waiter', userId: 'u1', name: 'Ravi' },
    items: [item(), item({ _id: 'i2', displayName: 'Veg Sandwich', status: 'cancelled' })],
    kotId: '1051',
    placedAt: '2026-10-08T07:30:00.000Z',
    status: 'pending',
    subtotal: 50,
    tax: 2.5,
    total: 52.5,
    elapsedMinutes: 3,
    isAddOn: true,
    ...over,
  };
}

describe('kotFromRound', () => {
  it('prints the same sheet as the kitchen board does for that round', () => {
    // What `kds-board-client.tsx` builds from the KDS ticket for this round.
    const fromBoard: KotData = {
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
          specialInstructions: 'less sugar',
          status: 'pending',
        },
        {
          displayName: 'Veg Sandwich',
          quantity: 2,
          specialInstructions: 'less sugar',
          status: 'cancelled',
        },
      ],
    };

    expect(buildKotText(kotFromRound(round()))).toBe(buildKotText(fromBoard));
  });

  it('names the server on a staff round and drops the line on a guest round', () => {
    expect(buildKotText(kotFromRound(round()))).toContain('SERVER  : Ravi');

    const guest = round({
      source: 'customer_qr',
      placedBy: { role: 'customer', userId: null, name: '' },
    });
    expect(buildKotText(kotFromRound(guest))).not.toContain('SERVER');
  });
});
