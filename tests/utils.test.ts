import { describe, expect, it } from 'vitest';

import {
  formatCurrency,
  formatCurrencyShort,
  formatElapsed,
  minutesSince,
  newIdempotencyKey,
  round2,
  sumBy,
} from '@/lib/utils';

/**
 * The pure helpers behind every number a guest or a cashier reads.
 *
 * Nothing here asserts on wording or styling — these are arithmetic and
 * formatting rules that stay true through any redesign.
 */

describe('minutesSince', () => {
  const now = new Date('2026-09-03T11:20:00.000Z').getTime();

  it('counts whole elapsed minutes', () => {
    expect(minutesSince('2026-09-03T10:11:00.000Z', now)).toBe(69);
  });

  it('never returns a negative, even when a device clock runs fast', () => {
    // A tablet whose clock is ten minutes ahead must not render "-10 min".
    expect(minutesSince('2026-09-03T11:30:00.000Z', now)).toBe(0);
  });

  it('treats a missing or unparseable timestamp as zero', () => {
    expect(minutesSince(null, now)).toBe(0);
    expect(minutesSince(undefined, now)).toBe(0);
    expect(minutesSince('not a date', now)).toBe(0);
  });
});

describe('formatElapsed', () => {
  it('reads "just now" under a minute', () => {
    expect(formatElapsed(0)).toBe('just now');
  });

  it('stays in minutes below an hour', () => {
    expect(formatElapsed(59)).toBe('59 min');
  });

  it('zero-pads the minutes past an hour so the column does not jitter', () => {
    expect(formatElapsed(69)).toBe('1h 09m');
  });

  it('does NOT wrap at 24 hours', () => {
    // A table left open overnight has to read as a day old, not as an hour
    // old. Anything that folds this modulo 24 makes yesterday look like now.
    expect(formatElapsed(60 * 25 + 9)).toBe('25h 09m');
    expect(formatElapsed(3110)).toBe('51h 50m');
  });
});

describe('money', () => {
  // Whether Intl puts a (non-breaking) space after the rupee sign varies by
  // Node's ICU build, and that is not something this app cares about. Compare
  // without it so the suite does not go red on a Node upgrade.
  const noSpace = (text: string) => text.replace(/\s/g, '');

  it('formats to two decimals for the counter screen', () => {
    expect(noSpace(formatCurrency(110.25))).toBe('₹110.25');
  });

  it('survives a NaN rather than printing a currency NaN on a bill', () => {
    expect(noSpace(formatCurrency(Number.NaN))).toBe('₹0.00');
    expect(formatCurrencyShort(Number.NaN)).toBe('₹0');
  });

  it('rounds the short form to whole rupees', () => {
    expect(formatCurrencyShort(110.25)).toBe('₹110');
    expect(formatCurrencyShort(110.5)).toBe('₹111');
  });

  it('round2 matches the backend, including the float edge it exists for', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(105.0000000001)).toBe(105);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it('sumBy totals a line list exactly', () => {
    const lines = [{ amount: 100 }, { amount: 5.25 }, { amount: 5 }];
    expect(round2(sumBy(lines, (line) => line.amount))).toBe(110.25);
  });
});

describe('newIdempotencyKey', () => {
  it('clears the backend 8-character minimum', () => {
    // The server rejects short keys precisely to catch naive "1"/"2" counters,
    // so a key that regressed to something short would fail every order.
    expect(newIdempotencyKey().length).toBeGreaterThanOrEqual(8);
  });

  it('never repeats — two tables replaying must not collide', () => {
    const keys = new Set(Array.from({ length: 500 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(500);
  });
});
