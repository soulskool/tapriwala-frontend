import { formatCurrency } from './utils';

/**
 * Calendar helpers for the Sales screen. Every date here is a café day,
 * `YYYY-MM-DD`, never an instant — the backend books each bill's day in
 * Asia/Kolkata and these only ever count and label those days.
 */

/**
 * Today in the café's calendar. Asia/Kolkata, the same zone the backend books
 * each bill's day in, so a phone left on another timezone still asks for the
 * right day. `en-CA` is used only because it formats as ISO.
 */
export function cafeToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Pure calendar arithmetic on a `YYYY-MM-DD`; UTC is only a counting device. */
export function shiftDay(day: string, by: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

/** "Wed, 08 Oct 2026" — the weekday is what an owner scans a month by. */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${day}T00:00:00.000Z`));
}

/** A column heading: "08 Oct" for a day, "Oct 2026" for a `YYYY-MM` month. */
export function formatPeriod(period: string): { main: string; sub: string } {
  if (period.length === 7) {
    const date = new Date(`${period}-01T00:00:00.000Z`);
    return {
      main: new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'short' }).format(date),
      sub: period.slice(0, 4),
    };
  }
  const date = new Date(`${period}T00:00:00.000Z`);
  return {
    main: new Intl.DateTimeFormat('en-IN', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
    }).format(date),
    sub: new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short' }).format(date),
  };
}

/** +₹0.50 / −₹0.05 — a round off can go either way, so it always shows its sign. */
export function formatSigned(amount: number): string {
  if (amount === 0) return formatCurrency(0);
  return `${amount < 0 ? '−' : '+'}${formatCurrency(Math.abs(amount))}`;
}
