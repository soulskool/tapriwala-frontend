/**
 * Shared types, mirroring the backend's response DTOs exactly.
 *
 * Dates arrive over JSON as ISO strings, so every timestamp is typed `string`
 * here rather than `Date` — pretending otherwise is how `.getTime is not a
 * function` reaches production.
 */

import type {
  ErrorCode,
  ExportMethod,
  ExportStatus,
  ItemStatus,
  KitchenStation,
  OrderSource,
  Role,
  RoundStatus,
  ServiceRequestStatus,
  ServiceRequestType,
  SessionStatus,
  TableZone,
  TileStatus,
} from './constants';

// ─── Envelope ────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/** Every successful response from the API has this shape. */
export interface ApiEnvelope<T> {
  success: true;
  message?: string;
  data: T;
  meta?: { pagination?: PaginationMeta };
}

/** One field-level complaint from express-validator. `details` is always an array. */
export interface FieldError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: FieldError[];
  };
  requestId?: string;
}

/** A page of results plus its pagination, as unwrapped by the api layer. */
export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  phone?: string;
  lastLoginAt?: string | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

// ─── Menu ────────────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  productCode: string;
  displayName: string;
  description: string;
  price: number;
  taxPercent: number;
  imageUrl: string;
  kitchenStation: KitchenStation;
  isAvailable: boolean;
  /** Staff-only: the name the legacy POS expects. Never sent to a customer. */
  posName?: string;
}

export interface MenuCategory {
  category: string;
  items: MenuItem[];
}

/** The full ProductMaster record, as admin screens edit it. */
export interface Product extends MenuItem {
  posName: string;
  category: string;
  displayOrder: number;
  isActive: boolean;
  imageKey: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export interface TableMaster {
  _id: string;
  code: string;
  zone: TableZone;
  displayOrder: number;
  seatingCapacity: number;
  isActive: boolean;
}

/** One tile on the live table screen. */
export interface LiveTableTile {
  tableId: string;
  code: string;
  zone: TableZone;
  displayOrder: number;
  seatingCapacity: number;
  status: TileStatus;
  sessionId: string | null;
  sessionNumber: number | null;
  openedAt: string | null;
  minutesOpen: number;
  runningTotal: number;
  roundCount: number;
  pendingItemCount: number;
  readyItemCount: number;
  openServiceRequests: number;
  billRequested: boolean;
  oldestRequestMinutes: number;
  needsAttention: boolean;
}

export interface LiveGridResponse {
  tables: LiveTableTile[];
  zones: TableZone[];
  count: number;
}

// ─── Sessions & rounds ───────────────────────────────────────────────────────

export interface OrderItem {
  _id: string;
  productCode: string;
  posName: string;
  displayName: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  specialInstructions: string;
  kitchenStation: KitchenStation;
  status: ItemStatus;
  lineTotal: number;
  acceptedAt?: string | null;
  readyAt?: string | null;
  servedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string;
}

export interface OrderRound {
  _id: string;
  sessionId: string;
  tableId: string;
  tableCode: string;
  roundNumber: number;
  source: OrderSource;
  placedBy: { role: string; userId: string | null; name: string };
  items: OrderItem[];
  kotId: string;
  placedAt: string;
  status: RoundStatus;
  subtotal: number;
  tax: number;
  total: number;
  /** Computed server-side on read. */
  elapsedMinutes: number;
  isAddOn: boolean;
}

export interface TableSession {
  _id: string;
  tableId: string;
  tableCode: string;
  sessionNumber: number;
  status: SessionStatus;
  isActive: boolean;
  openedAt: string;
  closedAt: string | null;
  billRequestedAt: string | null;
  totalRounds: number;
  runningTotal: number;
  guestCount: number;
  heldForReview: boolean;
  reviewNote: string;
  minutesOpen: number;
}

export interface Totals {
  subtotal: number;
  tax: number;
  total: number;
  itemCount: number;
}

export interface SessionDetail {
  session: TableSession;
  rounds: OrderRound[];
  serviceRequests: ServiceRequest[];
  totals: Totals;
}

// ─── Kitchen ─────────────────────────────────────────────────────────────────

export interface KdsTicketItem {
  itemId: string;
  productCode: string;
  displayName: string;
  quantity: number;
  specialInstructions: string;
  kitchenStation: KitchenStation;
  status: ItemStatus;
  /** The item was 86'd after this ticket was placed — flag it, don't hide it. */
  unavailable: boolean;
  /** Snapshotted at order time — never re-read from the menu. */
  unitPrice: number;
  lineTotal: number;
}

export interface KdsTicket {
  roundId: string;
  sessionId: string;
  tableId: string;
  tableCode: string;
  zone: TableZone;
  kotId: string;
  roundNumber: number;
  isAddOn: boolean;
  source: OrderSource;
  placedAt: string;
  elapsedMinutes: number;
  status: RoundStatus;
  /** What this round is worth, cancelled items excluded. */
  subtotal: number;
  tax: number;
  total: number;
  items: KdsTicketItem[];
}

export interface KitchenQueueResponse {
  tickets: KdsTicket[];
  count: number;
  generatedAt: string;
}

// ─── Service requests ────────────────────────────────────────────────────────

export interface ServiceRequest {
  _id?: string;
  requestId?: string;
  tableId: string;
  tableCode: string;
  sessionId: string | null;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  raisedAt: string;
  lastRaisedAt: string;
  /** Repeat taps bump this instead of creating a second row. */
  repeatCount: number;
  note: string;
  waitingMinutes: number;
  isEscalated: boolean;
}

export interface ServiceRequestQueue {
  requests: ServiceRequest[];
  count: number;
  escalated: number;
}

// ─── Billing ─────────────────────────────────────────────────────────────────

export interface BillingQueueEntry {
  sessionId: string;
  tableId: string;
  tableCode: string;
  sessionNumber: number;
  openedAt: string;
  billRequestedAt: string;
  waitingMinutes: number;
  runningTotal: number;
  totalRounds: number;
  heldForReview: boolean;
  reviewNote: string;
}

export interface ConsolidatedLine {
  productCode: string;
  posName: string;
  displayName: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  amount: number;
  taxAmount: number;
  kitchenStation: KitchenStation;
  /** Which rounds this quantity came from, for staff drill-down. */
  rounds: number[];
}

export interface ConsolidatedBill {
  sessionId: string;
  tableCode: string;
  sessionNumber: number;
  openedAt: string;
  status: SessionStatus;
  lines: ConsolidatedLine[];
  cancelledLines: ConsolidatedLine[];
  subtotal: number;
  tax: number;
  total: number;
  roundCount: number;
  itemCount: number;
  /** Items were cancelled after cooking started — a manager should look. */
  requiresReview: boolean;
}

/**
 * One frozen line on a saved bill.
 *
 * Narrower than `ConsolidatedLine` on purpose, and it must stay that way: the
 * stored document keeps only what a receipt and an audit need
 * (`IBillingExportLine`). It has no `displayName`, no `kitchenStation` and no
 * `rounds` — typing it as a `ConsolidatedLine`, as this used to, promised three
 * fields that arrive `undefined`.
 */
export interface BillingExportLine {
  productCode: string;
  /** The name the legacy POS knows. What gets printed on the receipt. */
  posName: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  amount: number;
  taxAmount: number;
}

/**
 * A generated bill, exactly as the API sends it.
 *
 * The API returns the Mongoose document unshaped, so these names and types
 * must match `backend/src/models/BillingExport.ts` field for field. Three of
 * them used to be wrong here: `billNumber` is a number, the failure reason is
 * `lastError` (declaring it as `error` meant the POS failure message could
 * never render), and `tableCode` was missing entirely.
 */
export interface BillingExport {
  _id: string;
  sessionId: string;
  tableId: string;
  tableCode: string;
  /** An integer from a global counter — never reused, never reset. */
  billNumber: number;
  generatedAt: string;
  generatedBy: { role: string; userId: string | null; name: string };
  lineItems: BillingExportLine[];
  subtotal: number;
  tax: number;
  total: number;
  exportMethod: ExportMethod;
  exportStatus: ExportStatus;
  posReferenceId: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  confirmedAt: string | null;
  note: string;
}

export interface ExportResult {
  export: BillingExport;
  bill: ConsolidatedBill;
}

// ─── Customer (QR) views ─────────────────────────────────────────────────────

export interface CustomerTable {
  id: string;
  code: string;
  zone: TableZone;
  seatingCapacity: number;
}

export interface CustomerSession {
  id: string;
  sessionNumber: number;
  status: SessionStatus;
  openedAt: string;
  runningTotal: number;
  totalRounds: number;
  billRequestedAt: string | null;
}

export interface ResolvedTable {
  table: CustomerTable;
  session: CustomerSession | null;
  /** Set when the table is mid-bill — a new guest must not join that bill. */
  warning: string | null;
}

export interface CustomerRoundItem {
  displayName: string;
  quantity: number;
  status: ItemStatus;
  specialInstructions: string;
}

export interface CustomerRound {
  roundNumber: number;
  kotId: string;
  status: RoundStatus;
  placedAt: string;
  elapsedMinutes: number;
  items: CustomerRoundItem[];
}

export interface CustomerOrderStatus {
  session: {
    id: string;
    status: SessionStatus;
    openedAt: string;
    billRequestedAt: string | null;
  } | null;
  rounds: CustomerRound[];
  totals: Totals | null;
}

export interface PlacedOrder {
  sessionId: string;
  roundId: string;
  roundNumber: number;
  kotId: string;
  status: RoundStatus;
  placedAt: string;
  items: { itemId: string; displayName: string; quantity: number; status: ItemStatus }[];
  total: number;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface AdminOverview {
  generatedAt: string;
  summary: {
    totalTables: number;
    occupiedTables: number;
    freeTables: number;
    liveTickets: number;
    openServiceRequests: number;
    escalatedRequests: number;
    awaitingBill: number;
    readyButUnserved: number;
    runningRevenue: number;
  };
  tables: LiveTableTile[];
  kitchenQueue: KdsTicket[];
  serviceRequests: ServiceRequest[];
  billingQueue: BillingQueueEntry[];
  readyTooLong: OrderRound[];
}

export interface StaffUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface AuditEntry {
  _id: string;
  entityType: string;
  entityId: string;
  action: string;
  actor: { role: string; userId: string | null; name: string };
  tableCode: string;
  sessionId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Cart (client-only state) ────────────────────────────────────────────────

/** One line in an unsubmitted cart. Prices shown here are never trusted by the API. */
export interface CartLine {
  productCode: string;
  displayName: string;
  unitPrice: number;
  quantity: number;
  specialInstructions: string;
}

/** What a client sends when placing a round — codes and quantities only. */
export interface OrderItemInput {
  productCode: string;
  quantity: number;
  specialInstructions?: string;
}
