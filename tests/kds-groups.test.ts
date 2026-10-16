import { describe, expect, it } from 'vitest';

import { ITEM_STATUS, type ItemStatus } from '@/lib/constants';
import { groupTicketsByTable, isTicketAllReady, oldestOpenTicket } from '@/lib/kds-groups';
import type { KdsTicket } from '@/lib/types';

/**
 * The kitchen board's one-card-per-table grouping.
 *
 * The rounds must stay separate inside the card — each is its own cooking job —
 * so what is tested here is that grouping only ever *collects* rounds: it never
 * merges their items, drops one, or mixes two tables.
 */

function ticket(
  sessionId: string,
  roundNumber: number,
  statuses: ItemStatus[] = [ITEM_STATUS.PENDING],
): KdsTicket {
  return {
    roundId: `${sessionId}-r${roundNumber}`,
    sessionId,
    tableId: `t-${sessionId}`,
    tableCode: sessionId.toUpperCase(),
    zone: 'Main' as KdsTicket['zone'],
    kotId: `K${roundNumber}`,
    roundNumber,
    isAddOn: roundNumber > 1,
    source: 'waiter' as KdsTicket['source'],
    orderType: 'dine_in' as KdsTicket['orderType'],
    placedByName: 'Test',
    placedAt: new Date(2026, 9, 15, 12, roundNumber).toISOString(),
    elapsedMinutes: 0,
    status: statuses[0]!,
    subtotal: 0,
    tax: 0,
    total: 0,
    items: statuses.map((status, index) => ({
      itemId: `${sessionId}-r${roundNumber}-i${index}`,
      productCode: 'TEA',
      displayName: 'Tea',
      quantity: 1,
      specialInstructions: '',
      kitchenStation: 'Beverage' as KdsTicket['items'][number]['kitchenStation'],
      status,
      unavailable: false,
      unitPrice: 20,
      lineTotal: 20,
    })),
  };
}

describe('groupTicketsByTable', () => {
  it('puts every round of a table on one card, in round order', () => {
    const groups = groupTicketsByTable([ticket('m2', 1), ticket('o1', 1), ticket('m2', 2)]);

    expect(groups.map((group) => group.tableCode)).toEqual(['M2', 'O1']);
    expect(groups[0]!.tickets.map((entry) => entry.roundNumber)).toEqual([1, 2]);
  });

  it('keeps the rounds separate — no items merged or lost', () => {
    const input = [ticket('m2', 1), ticket('m2', 2), ticket('m2', 3)];
    const [group] = groupTicketsByTable(input);

    expect(group!.tickets).toHaveLength(3);
    expect(group!.tickets.flatMap((entry) => entry.items)).toHaveLength(3);
  });

  it('places a table by its oldest round, so an add-on does not send it to the back', () => {
    // Queue order is oldest first: M2 round 1, then O1, then M2's add-on.
    const groups = groupTicketsByTable([ticket('m2', 1), ticket('o1', 1), ticket('m2', 2)]);
    expect(groups[0]!.tableCode).toBe('M2');
  });

  it('returns nothing for an empty board', () => {
    expect(groupTicketsByTable([])).toEqual([]);
  });
});

describe('isTicketAllReady', () => {
  it('ignores cancelled items but needs at least one live one', () => {
    expect(isTicketAllReady(ticket('a', 1, [ITEM_STATUS.READY, ITEM_STATUS.CANCELLED]))).toBe(true);
    expect(isTicketAllReady(ticket('a', 1, [ITEM_STATUS.CANCELLED]))).toBe(false);
    expect(isTicketAllReady(ticket('a', 1, [ITEM_STATUS.READY, ITEM_STATUS.PREPARING]))).toBe(
      false,
    );
  });
});

describe('oldestOpenTicket', () => {
  it('follows the oldest round still owed, not one already under the pass', () => {
    const [group] = groupTicketsByTable([
      ticket('m2', 1, [ITEM_STATUS.READY]),
      ticket('m2', 2, [ITEM_STATUS.PREPARING]),
    ]);
    expect(oldestOpenTicket(group!).roundNumber).toBe(2);
  });

  it('falls back to the first round when everything is ready', () => {
    const [group] = groupTicketsByTable([
      ticket('m2', 1, [ITEM_STATUS.READY]),
      ticket('m2', 2, [ITEM_STATUS.READY]),
    ]);
    expect(oldestOpenTicket(group!).roundNumber).toBe(1);
  });
});
