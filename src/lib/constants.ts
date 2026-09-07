/**
 * Domain contract — mirrored from the backend's `src/config/constants.ts`.
 *
 * Kept as `as const` objects with derived union types for the same reason the
 * backend does it: add a status on one side, and every `switch` on the other
 * side that fails to handle it stops compiling instead of silently rendering
 * a blank tile at 8pm on a Friday.
 *
 * Nothing here may drift from the backend file. If you change one, change both.
 */

// ─── Roles ───────────────────────────────────────────────────────────────────

export const ROLES = {
  WAITER: 'waiter',
  KITCHEN: 'kitchen',
  BILLING: 'billing',
  ADMIN: 'admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
export const ROLE_VALUES = Object.values(ROLES) as Role[];

/** Where each role lands after a PIN login. */
export const ROLE_HOME: Record<Role, string> = {
  [ROLES.WAITER]: '/waiter',
  [ROLES.KITCHEN]: '/kitchen',
  [ROLES.BILLING]: '/billing',
  [ROLES.ADMIN]: '/admin',
};

// ─── Tables ──────────────────────────────────────────────────────────────────

export const TABLE_ZONES = {
  LEFT: 'Left',
  MIDDLE: 'Middle',
  RIGHT: 'Right',
  VERANDA: 'Veranda',
  LAWN: 'Lawn',
} as const;

export type TableZone = (typeof TABLE_ZONES)[keyof typeof TABLE_ZONES];
export const TABLE_ZONE_VALUES = Object.values(TABLE_ZONES) as TableZone[];

/** Floor order for the live grid, so zones read the way the café is laid out. */
export const ZONE_DISPLAY_ORDER: TableZone[] = [
  TABLE_ZONES.LEFT,
  TABLE_ZONES.MIDDLE,
  TABLE_ZONES.RIGHT,
  TABLE_ZONES.VERANDA,
  TABLE_ZONES.LAWN,
];

// ─── Kitchen ─────────────────────────────────────────────────────────────────

export const KITCHEN_STATIONS = {
  KITCHEN: 'Kitchen',
  BEVERAGE: 'Beverage',
  OTHER: 'Other',
} as const;

export type KitchenStation = (typeof KITCHEN_STATIONS)[keyof typeof KITCHEN_STATIONS];
export const KITCHEN_STATION_VALUES = Object.values(KITCHEN_STATIONS) as KitchenStation[];

// ─── Sessions ────────────────────────────────────────────────────────────────

export const SESSION_STATUS = {
  OCCUPIED: 'occupied',
  ORDER_PENDING: 'order_pending',
  PREPARING: 'preparing',
  READY: 'ready',
  BILL_REQUESTED: 'bill_requested',
  CLOSED: 'closed',
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

/** A table with no live session. Only ever produced by the live-grid endpoint. */
export const TILE_EMPTY = 'empty' as const;
export type TileStatus = SessionStatus | typeof TILE_EMPTY;

// ─── Orders ──────────────────────────────────────────────────────────────────

export const ORDER_SOURCE = {
  CUSTOMER_QR: 'customer_qr',
  WAITER: 'waiter',
} as const;

export type OrderSource = (typeof ORDER_SOURCE)[keyof typeof ORDER_SOURCE];

/**
 * Whether a round is eaten at the table or carried out. Mirrors the backend.
 *
 * On the round, not the session: one occupancy genuinely mixes the two, and the
 * round is already the unit the KOT and the KDS card are built from.
 *
 * A guest's phone never sends this — the public endpoint ignores the field, so
 * `parcel` can only ever come from a staff device. Do not add the toggle to the
 * customer order screen without changing the backend first; it would render a
 * control that silently does nothing.
 */
export const ORDER_TYPE = {
  DINING: 'dining',
  PARCEL: 'parcel',
} as const;

export type OrderType = (typeof ORDER_TYPE)[keyof typeof ORDER_TYPE];
export const ORDER_TYPE_VALUES = Object.values(ORDER_TYPE) as OrderType[];

/** Screen label. The KOT and the receipt print the uppercase form themselves. */
export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  [ORDER_TYPE.DINING]: 'Dining',
  [ORDER_TYPE.PARCEL]: 'Parcel',
};

export const ITEM_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  SERVED: 'served',
  CANCELLED: 'cancelled',
} as const;

export type ItemStatus = (typeof ITEM_STATUS)[keyof typeof ITEM_STATUS];

export const ROUND_STATUS = ITEM_STATUS;
export type RoundStatus = ItemStatus;

/**
 * The three buttons on a KDS ticket, in the order a cook taps them.
 *
 * The backend allows forward skips (pending → ready for a poured tea), so the
 * board renders all three at once rather than one "next step" button.
 */
export const KITCHEN_SETTABLE_STATUSES = [
  ITEM_STATUS.ACCEPTED,
  ITEM_STATUS.PREPARING,
  ITEM_STATUS.READY,
] as const;

/** Item statuses that still owe the guest food. Drives "outstanding" counts. */
export const LIVE_ITEM_STATUSES: ItemStatus[] = [
  ITEM_STATUS.PENDING,
  ITEM_STATUS.ACCEPTED,
  ITEM_STATUS.PREPARING,
  ITEM_STATUS.READY,
];

// ─── Service requests ────────────────────────────────────────────────────────

export const SERVICE_REQUEST_TYPE = {
  WATER: 'water',
  CALL_STAFF: 'call_staff',
  BILL: 'bill',
} as const;

export type ServiceRequestType = (typeof SERVICE_REQUEST_TYPE)[keyof typeof SERVICE_REQUEST_TYPE];

export const SERVICE_REQUEST_STATUS = {
  OPEN: 'open',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED: 'resolved',
  CANCELLED: 'cancelled',
} as const;

export type ServiceRequestStatus =
  (typeof SERVICE_REQUEST_STATUS)[keyof typeof SERVICE_REQUEST_STATUS];

// ─── Billing / POS export ────────────────────────────────────────────────────

export const EXPORT_METHOD = {
  API: 'api',
  CSV: 'csv',
  MANUAL_DISPLAY: 'manual_display',
} as const;

export type ExportMethod = (typeof EXPORT_METHOD)[keyof typeof EXPORT_METHOD];

export const EXPORT_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
} as const;

export type ExportStatus = (typeof EXPORT_STATUS)[keyof typeof EXPORT_STATUS];

// ─── Errors ──────────────────────────────────────────────────────────────────

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
  INVALID_STATE: 'INVALID_STATE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ─── Socket.IO contract ──────────────────────────────────────────────────────

export const SOCKET_EVENTS = {
  // client -> server
  JOIN_ROLE: 'join:role',
  JOIN_TABLE: 'join:table',
  JOIN_SESSION: 'join:session',
  LEAVE_SESSION: 'leave:session',

  // server -> client
  ROUND_NEW: 'round:new',
  ROUND_ITEM_STATUS: 'round:itemStatus',
  ROUND_STATUS: 'round:status',
  SESSION_STATUS_CHANGE: 'session:statusChange',
  SESSION_OPENED: 'session:opened',
  SESSION_CLOSED: 'session:closed',
  SERVICE_REQUEST_NEW: 'serviceRequest:new',
  SERVICE_REQUEST_UPDATE: 'serviceRequest:update',
  PRODUCT_AVAILABILITY: 'product:availability',
  TABLE_STATUS: 'table:status',

  // transport level
  ERROR: 'app:error',
  JOINED: 'app:joined',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

// ─── UI thresholds ───────────────────────────────────────────────────────────

/**
 * Client-side escalation thresholds.
 *
 * The backend owns the authoritative numbers (`isEscalated`, `needsAttention`)
 * and those always win. These exist only so a timer that ticks between two
 * fetches can turn a card red without waiting for the next round-trip.
 */
export const UI_THRESHOLDS = {
  /** A KDS ticket older than this is visually urgent. */
  TICKET_URGENT_MINUTES: 10,
  /** A KDS ticket older than this is late — largest treatment on the board. */
  TICKET_LATE_MINUTES: 20,
  /** An unattended service request older than this flashes on the waiter feed. */
  REQUEST_ESCALATION_MINUTES: 5,
  /** Food sitting under the pass longer than this nags the waiter. */
  READY_UNSERVED_MINUTES: 5,
  /** How often elapsed-time labels recompute. */
  ELAPSED_TICK_MS: 15_000,
  /** Search inputs wait this long before filtering. */
  SEARCH_DEBOUNCE_MS: 200,
} as const;

export const CART_LIMITS = {
  MAX_ITEMS_PER_ROUND: 50,
  MAX_QUANTITY_PER_ITEM: 99,
  MAX_SPECIAL_INSTRUCTIONS_LENGTH: 300,
} as const;
