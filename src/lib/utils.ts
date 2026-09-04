/**
 * Small, dependency-free helpers shared across the four role apps.
 *
 * Anything here must be safe to call during a server render — no `window`,
 * no `localStorage`, no `Date.now()` baked into a module-level constant.
 */

import {
  ITEM_STATUS,
  SERVICE_REQUEST_TYPE,
  SESSION_STATUS,
  TILE_EMPTY,
  type ItemStatus,
  type ServiceRequestType,
  type TileStatus,
} from './constants';

// ─── Class names ─────────────────────────────────────────────────────────────

/**
 * Joins class names, dropping falsy entries.
 *
 * Deliberately not `clsx` — this is the whole of what we use, and one less
 * dependency in the customer bundle is one less thing to download on café
 * Wi-Fi.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ─── Money ───────────────────────────────────────────────────────────────────

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,234.50 — the format staff read off the counter screen. */
export function formatCurrency(amount: number): string {
  return currencyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

/** ₹1,235 — for tiles and badges where the paise are noise. */
export function formatCurrencyShort(amount: number): string {
  return `₹${Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString('en-IN')}`;
}

// ─── Time ────────────────────────────────────────────────────────────────────

/** Whole minutes since an ISO timestamp. Never negative, even with clock skew. */
export function minutesSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now - then) / 60_000));
}

/**
 * "just now" / "8 min" / "1h 05m" — the label on a KDS ticket.
 *
 * Compact on purpose: this sits next to a table code in very large type on a
 * tablet across the kitchen, so it has to stay short at a glance.
 */
export function formatElapsed(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${String(rest).padStart(2, '0')}m`;
}

/** 7:32 PM — when a round was placed. */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** 12 Aug, 7:32 PM — for history lists where the day matters. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Labels ──────────────────────────────────────────────────────────────────

/**
 * Human labels for tile status.
 *
 * §5 of the plan requires colour **plus** a label — a colour-blind waiter must
 * be able to read the floor, so no tile is ever distinguished by hue alone.
 */
export const TILE_STATUS_LABEL: Record<TileStatus, string> = {
  [TILE_EMPTY]: 'Empty',
  [SESSION_STATUS.OCCUPIED]: 'Occupied',
  [SESSION_STATUS.ORDER_PENDING]: 'Order placed',
  [SESSION_STATUS.PREPARING]: 'Preparing',
  [SESSION_STATUS.READY]: 'Ready',
  [SESSION_STATUS.BILL_REQUESTED]: 'Bill requested',
  [SESSION_STATUS.CLOSED]: 'Closed',
};

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  [ITEM_STATUS.PENDING]: 'New',
  [ITEM_STATUS.ACCEPTED]: 'Accepted',
  [ITEM_STATUS.PREPARING]: 'Preparing',
  [ITEM_STATUS.READY]: 'Ready',
  [ITEM_STATUS.SERVED]: 'Served',
  [ITEM_STATUS.CANCELLED]: 'Cancelled',
};

export const SERVICE_REQUEST_LABEL: Record<ServiceRequestType, string> = {
  [SERVICE_REQUEST_TYPE.WATER]: 'Water',
  [SERVICE_REQUEST_TYPE.CALL_STAFF]: 'Call staff',
  [SERVICE_REQUEST_TYPE.BILL]: 'Bill',
};

/** Icons double as the non-colour channel on request chips. */
export const SERVICE_REQUEST_ICON: Record<ServiceRequestType, string> = {
  [SERVICE_REQUEST_TYPE.WATER]: '💧',
  [SERVICE_REQUEST_TYPE.CALL_STAFF]: '🔔',
  [SERVICE_REQUEST_TYPE.BILL]: '🧾',
};

// ─── Misc ────────────────────────────────────────────────────────────────────

/**
 * A submission key that survives a double-tap and a retry.
 *
 * The backend rejects anything under 8 characters precisely to catch naive
 * `"1"`/`"2"` counters, so this must stay a real random value.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `k-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Groups a list by a derived key, preserving insertion order. */
export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const item of items) {
    const bucket = grouped.get(key(item));
    if (bucket) bucket.push(item);
    else grouped.set(key(item), [item]);
  }
  return grouped;
}

/** Sums a numeric projection. Saves a `reduce` with an explicit `0` everywhere. */
export function sumBy<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

/** Two decimal places, matching the backend's `round2`. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Initials for an avatar chip, e.g. "Ravi Kumar" → "RK". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
