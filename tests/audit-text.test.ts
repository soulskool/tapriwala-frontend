import { describe, expect, it } from 'vitest';

import { describeAudit } from '@/lib/audit-text';
import type { AuditEntry } from '@/lib/types';

/**
 * The audit trail as sentences.
 *
 * What matters: the right person, the right table, the right item — and a row
 * written by an older backend (no names, missing fields) still reads as a
 * plain sentence rather than "undefined".
 */

function entry(over: Partial<AuditEntry>): AuditEntry {
  return {
    _id: 'a1',
    entityType: 'OrderRound',
    entityId: 'e1',
    action: 'session.opened',
    actor: { role: 'waiter', userId: 'u1', name: 'Sumanth' },
    tableCode: 'M4',
    sessionId: 's1',
    before: null,
    after: null,
    meta: {},
    timestamp: '2026-10-08T13:33:00.000Z',
    ...over,
  };
}

describe('describeAudit', () => {
  it('says who served what, on which table', () => {
    const { kind, text } = describeAudit(
      entry({
        action: 'round.item_status_changed',
        before: { status: 'ready' },
        after: { status: 'served' },
        meta: { productCode: 'BEV001', displayName: 'Masala Tea', quantity: 2, kotId: '1116' },
      }),
    );
    expect(kind).toBe('Kitchen');
    expect(text).toBe('Sumanth served 2 × Masala Tea on M4');
  });

  it("falls back to today's menu name for a row written before names were stored", () => {
    const { text } = describeAudit(
      entry({
        action: 'round.item_status_changed',
        after: { status: 'ready' },
        meta: { productCode: 'BEV001', quantity: 1 },
        productNames: { BEV001: 'Masala Tea' },
      }),
    );
    expect(text).toBe('Sumanth marked 1 × Masala Tea Ready on M4');
  });

  it('names a QR order as the guest at that table', () => {
    const { text } = describeAudit(
      entry({
        action: 'round.placed',
        actor: { role: 'customer', userId: null, name: 'Customer @ M4' },
        after: {
          kotId: '1116',
          total: 452,
          items: [
            { productCode: 'A', displayName: 'Filter Coffee', quantity: 1 },
            { productCode: 'B', displayName: 'Bun Maska', quantity: 2 },
          ],
        },
      }),
    );
    expect(text).toBe(
      'Guest at M4 ordered 1 × Filter Coffee, 2 × Bun Maska on M4 — KOT 1116, ₹452',
    );
  });

  it('tells a paid close from a table freed without a bill', () => {
    const paid = describeAudit(
      entry({
        action: 'session.closed',
        before: { runningTotal: 336 },
        meta: { billingExportId: 'b1', itemsWrittenOff: 0 },
      }),
    );
    expect(paid.text).toBe('Sumanth took payment and freed M4 (₹336)');

    const walkout = describeAudit(
      entry({ action: 'session.closed', meta: { billingExportId: null, itemsWrittenOff: 2 } }),
    );
    expect(walkout.text).toBe('Sumanth freed M4 without a bill — 2 items written off');
  });

  it('reads the bill request and the bill itself', () => {
    expect(
      describeAudit(
        entry({ action: 'session.status_changed', after: { status: 'bill_requested' } }),
      ).text,
    ).toBe('Sumanth asked for the bill on M4');

    expect(
      describeAudit(entry({ action: 'billing.exported', after: { billNumber: 123, total: 452 } }))
        .text,
    ).toBe('Sumanth generated bill #123 for M4 — ₹452');
  });

  it('says what changed on a staff account', () => {
    const { text } = describeAudit(
      entry({
        action: 'user.updated',
        actor: { role: 'admin', userId: null, name: 'system' },
        tableCode: '',
        before: { name: 'Cafe Admin', isActive: false },
        after: { name: 'Cafe Admin', isActive: true },
      }),
    );
    expect(text).toBe('system reactivated Cafe Admin');
  });

  it('never prints "undefined" for a row missing its fields', () => {
    for (const action of [
      'round.placed',
      'round.item_status_changed',
      'round.item_cancelled',
      'session.closed',
      'session.transferred',
      'billing.exported',
      'service_request.updated',
      'product.availability_toggled',
      'user.updated',
      'something.new',
    ]) {
      const { text } = describeAudit(entry({ action, before: null, after: null, meta: null }));
      expect(text, action).not.toMatch(/undefined|null|NaN/);
    }
  });
});
