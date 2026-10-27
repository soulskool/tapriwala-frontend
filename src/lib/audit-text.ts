import {
  ITEM_STATUS,
  ROLE_LABEL,
  SESSION_STATUS,
  type ItemStatus,
  type Role,
  type ServiceRequestType,
  type SessionStatus,
} from './constants';
import type { AuditEntry } from './types';
import { ITEM_STATUS_LABEL, TILE_STATUS_LABEL, formatBillTotal } from './utils';

/**
 * One audit row as a sentence: "Sumanth served 2 × Masala Tea on M4".
 *
 * The backend stores structured events — an action, an actor, the table, and
 * before/after/meta snapshots — and never English. The wording lives here, at
 * read time, so it can be improved without touching a single stored row, and
 * every row ever written reads in today's wording. The raw snapshots stay one
 * tap away on the screen; this is the summary, not a replacement for them.
 *
 * Every field is read defensively: rows are years of history written by every
 * version of the backend, and a missing field must degrade to a plainer
 * sentence, never to "undefined" or a crash.
 */

export type AuditKind = 'Table' | 'Order' | 'Kitchen' | 'Request' | 'Bill' | 'Menu' | 'Staff';

export interface AuditSentence {
  kind: AuditKind;
  text: string;
}

type Bag = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const bag = (value: unknown): Bag =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Bag) : {};

const REQUEST_NOUN: Record<ServiceRequestType, string> = {
  water: 'water',
  call_staff: 'a waiter',
  bill: 'the bill',
};

const REQUEST_STATUS_VERB: Record<string, string> = {
  acknowledged: 'acknowledged',
  resolved: 'resolved',
  cancelled: 'cancelled',
};

/** Who did it, in words a manager would say out loud. */
function who(entry: AuditEntry): string {
  if (entry.actor.role === 'customer') {
    return entry.tableCode ? `Guest at ${entry.tableCode}` : 'A guest';
  }
  return entry.actor.name || entry.actor.role;
}

const onTable = (entry: AuditEntry): string => (entry.tableCode ? ` on ${entry.tableCode}` : '');
const money = (value: unknown): string => {
  const amount = num(value);
  return amount === null ? '' : formatBillTotal(amount);
};

/** "2 × Masala Tea", preferring the name stored on the row, then today's menu. */
function itemPhrase(item: Bag, names: Record<string, string>): string {
  const code = str(item.productCode);
  const name = str(item.displayName) || names[code] || code || 'an item';
  const quantity = num(item.quantity);
  return quantity === null ? name : `${quantity} × ${name}`;
}

function sessionStatus(value: unknown): string {
  const status = str(value) as SessionStatus;
  return TILE_STATUS_LABEL[status] ?? status;
}

export function describeAudit(entry: AuditEntry): AuditSentence {
  const actor = who(entry);
  const before = bag(entry.before);
  const after = bag(entry.after);
  const meta = bag(entry.meta);
  const names = entry.productNames ?? {};
  const table = entry.tableCode ?? '';

  switch (entry.action) {
    // ── Tables / sessions ──
    case 'session.opened':
      return { kind: 'Table', text: `${actor} opened table ${table}`.trim() };

    case 'session.status_changed': {
      const to = str(after.status);
      if (to === SESSION_STATUS.BILL_REQUESTED) {
        return { kind: 'Table', text: `${actor} asked for the bill${onTable(entry)}` };
      }
      return {
        kind: 'Table',
        text: `${table || 'Table'} went from ${sessionStatus(before.status)} to ${sessionStatus(to)}`,
      };
    }

    case 'session.closed': {
      const amount = money(before.runningTotal);
      if (meta.billingExportId) {
        return {
          kind: 'Table',
          text: `${actor} took payment and freed ${table || 'the table'}${amount ? ` (${amount})` : ''}`,
        };
      }
      const writtenOff = num(meta.itemsWrittenOff) ?? 0;
      return {
        kind: 'Table',
        text:
          `${actor} freed ${table || 'the table'} without a bill` +
          (writtenOff > 0 ? `, ${writtenOff} item${writtenOff === 1 ? '' : 's'} written off` : ''),
      };
    }

    case 'session.transferred':
      return {
        kind: 'Table',
        text: `${actor} moved the guests from ${str(before.tableCode) || '?'} to ${str(after.tableCode) || '?'}`,
      };

    case 'session.held_for_review': {
      const note = str(after.reviewNote);
      return after.heldForReview === false
        ? { kind: 'Table', text: `${actor} released ${table || 'the table'} from review` }
        : {
            kind: 'Table',
            text: `${actor} held ${table || 'the table'} for manager review${note ? `: ${note}` : ''}`,
          };
    }

    // ── Orders and the kitchen ──
    case 'round.placed': {
      const items = Array.isArray(after.items) ? (after.items as unknown[]).map(bag) : [];
      const kot = str(after.kotId);
      const total = money(after.total);
      const parcel = after.orderType === 'parcel' ? ' (parcel)' : '';
      return {
        kind: 'Order',
        text:
          `${actor} ordered ${items.map((item) => itemPhrase(item, names)).join(', ') || 'items'}` +
          `${onTable(entry)}${parcel}` +
          (kot || total ? `: ${[kot && `KOT ${kot}`, total].filter(Boolean).join(', ')}` : ''),
      };
    }

    case 'round.item_status_changed': {
      const to = str(after.status) as ItemStatus;
      const item = itemPhrase(meta, names);
      if (to === ITEM_STATUS.SERVED) {
        return { kind: 'Kitchen', text: `${actor} served ${item}${onTable(entry)}` };
      }
      return {
        kind: 'Kitchen',
        text: `${actor} marked ${item} ${ITEM_STATUS_LABEL[to] ?? to}${onTable(entry)}`,
      };
    }

    case 'round.item_cancelled': {
      // Freeing a table writes its unserved items off in one row per KOT.
      if (Array.isArray(meta.items)) {
        return {
          kind: 'Kitchen',
          text: `${actor} wrote off ${(meta.items as unknown[]).map(str).join(', ')}${onTable(entry)}, table freed without a bill`,
        };
      }
      const reason = str(meta.reason);
      const cooked = meta.cancelledAfterPrep ? ' after it was cooked' : '';
      return {
        kind: 'Kitchen',
        text: `${actor} cancelled ${itemPhrase(meta, names)}${onTable(entry)}${cooked}${reason ? `: “${reason}”` : ''}`,
      };
    }

    // ── Guest requests ──
    case 'service_request.raised': {
      const noun = REQUEST_NOUN[str(after.type) as ServiceRequestType] ?? 'help';
      return { kind: 'Request', text: `${actor} asked for ${noun}` };
    }

    case 'service_request.updated': {
      const noun = REQUEST_NOUN[str(meta.type) as ServiceRequestType];
      const verb = REQUEST_STATUS_VERB[str(after.status)] ?? 'updated';
      const minutes = num(meta.responseMinutes);
      return {
        kind: 'Request',
        text:
          `${actor} ${verb} ${table ? `${table}'s ` : 'a '}${noun ? `request for ${noun}` : 'request'}` +
          (verb === 'resolved' && minutes !== null ? ` after ${minutes} min` : ''),
      };
    }

    // ── Two tables, one bill ──
    case 'session.bill_moved': {
      const also = Array.isArray(meta.alsoMoved) ? meta.alsoMoved.map(str).filter(Boolean) : [];
      return {
        kind: 'Bill',
        text:
          `${actor} moved ${str(meta.fromTableCode) || table || 'a table'}'s bill to ${str(meta.toTableCode) || 'another table'}` +
          (also.length > 0 ? ` (with ${also.join(', ')})` : '') +
          because(meta),
      };
    }
    case 'session.bill_move_undone': {
      const from = str(meta.fromTableCode) || table || 'a table';
      const to = str(meta.toTableCode);
      return {
        kind: 'Bill',
        text: meta.automatic
          ? `${from} got its own bill back${to ? ` when ${to} was freed without a bill` : ''}`
          : `${actor} gave ${from} its own bill back${to ? ` (was with ${to})` : ''}${because(meta)}`,
      };
    }

    // ── Bills ──
    case 'billing.exported': {
      const number = num(after.billNumber);
      const total = money(after.total);
      return {
        kind: 'Bill',
        text:
          `${actor} generated bill${number !== null ? ` #${number}` : ''}${table ? ` for ${table}` : ''}` +
          (total ? `: ${total}` : ''),
      };
    }
    case 'billing.export_retried':
      return {
        kind: 'Bill',
        text: `${actor} retried sending a bill${table ? ` for ${table}` : ''}`,
      };
    case 'billing.export_confirmed':
      return { kind: 'Bill', text: `${actor} marked the bill${table ? ` for ${table}` : ''} paid` };

    // ── Menu ──
    case 'product.created':
      return {
        kind: 'Menu',
        text: `${actor} added ${str(after.displayName) || 'an item'} to the menu`,
      };
    case 'product.updated': {
      const name = str(meta.displayName) || str(after.displayName) || 'a menu item';
      if (meta.source === 'image_upload') {
        return { kind: 'Menu', text: `${actor} uploaded a photo for ${name}` };
      }
      if (meta.source === 'image_removed') {
        return { kind: 'Menu', text: `${actor} removed the photo from ${name}` };
      }
      return { kind: 'Menu', text: `${actor} edited ${name}` };
    }
    case 'product.deleted': {
      const name = str(meta.displayName) || str(before.displayName) || 'an item';
      return { kind: 'Menu', text: `${actor} deleted ${name} from the menu${because(meta)}` };
    }
    case 'product.availability_toggled': {
      const name = itemPhrase({ ...meta, quantity: undefined }, names);
      return {
        kind: 'Menu',
        text: after.isAvailable
          ? `${actor} put ${name} back on the menu`
          : `${actor} marked ${name} sold out`,
      };
    }

    // ── Table set-up ──
    case 'table.created':
      return { kind: 'Table', text: `${actor} added table ${str(after.code)}` };
    case 'table.updated': {
      const code = str(after.code);
      if (before.isActive !== false && after.isActive === false) {
        return { kind: 'Table', text: `${actor} took table ${code} out of service` };
      }
      if (str(before.zone) && str(after.zone) && before.zone !== after.zone) {
        return {
          kind: 'Table',
          text: `${actor} moved table ${code} from ${str(before.zone)} to ${str(after.zone)}`,
        };
      }
      return { kind: 'Table', text: `${actor} edited table ${code}` };
    }
    case 'table.deleted':
      return {
        kind: 'Table',
        text: `${actor} deleted table ${str(before.code) || table}${because(meta)}`,
      };

    // ── Zones ──
    case 'zone.created':
      return { kind: 'Table', text: `${actor} added the zone ${str(after.name)}` };
    case 'zone.updated': {
      const from = str(before.name);
      const to = str(after.name);
      return {
        kind: 'Table',
        text:
          from && to && from !== to
            ? `${actor} renamed the zone ${from} to ${to}`
            : `${actor} changed where ${to || 'a zone'} sits on the floor`,
      };
    }
    case 'zone.deleted':
      return {
        kind: 'Table',
        text: `${actor} deleted the zone ${str(before.name)}${because(meta)}`,
      };
    case 'table.qr_rotated':
      return { kind: 'Table', text: `${actor} issued a new QR code${onTable(entry)}` };

    // ── Staff ──
    case 'user.login':
      return { kind: 'Staff', text: `${actor} signed in` };
    case 'user.created':
      return {
        kind: 'Staff',
        text: `${actor} added ${str(after.name) || 'a staff member'} as ${roleName(after.role) || 'staff'}`,
      };
    case 'user.updated':
      return { kind: 'Staff', text: describeUserUpdate(actor, before, after, meta) };
    case 'user.deleted': {
      const role = roleName(before.role);
      return {
        kind: 'Staff',
        text: `${actor} deleted ${str(before.name) || 'a staff member'}${role ? ` (${role})` : ''}${because(meta)}`,
      };
    }

    default:
      return { kind: 'Table', text: `${actor} · ${entry.action}` };
  }
}

/** `: “reason”` when the person gave one, nothing when they did not. */
function because(meta: Bag): string {
  const reason = str(meta.reason).trim();
  return reason ? `: “${reason}”` : '';
}

/**
 * A role as people say it ("admins", not "super_admin"). Falls back to the
 * stored value for a role this build does not know, so an old row still reads.
 */
function roleName(value: unknown): string {
  const role = str(value);
  return (ROLE_LABEL[role as Role] ?? role).toLowerCase();
}

/** A staff edit, saying what actually changed rather than "updated a user". */
function describeUserUpdate(actor: string, before: Bag, after: Bag, meta: Bag): string {
  const name = str(after.name) || str(before.name) || 'a staff member';
  const changes: string[] = [];

  if (before.isActive === false && after.isActive === true) changes.push(`reactivated ${name}`);
  if (before.isActive === true && after.isActive === false) changes.push(`deactivated ${name}`);
  if (str(before.role) && str(after.role) && before.role !== after.role) {
    changes.push(`changed ${name}'s role from ${roleName(before.role)} to ${roleName(after.role)}`);
  }
  if (str(before.name) && str(after.name) && before.name !== after.name) {
    changes.push(`renamed ${str(before.name)} to ${str(after.name)}`);
  }
  if (str(before.phone) && str(after.phone) && before.phone !== after.phone) {
    changes.push(`changed ${name}'s phone number`);
  }
  if (meta.pinChanged) changes.push(`changed ${name}'s PIN`);

  return changes.length > 0 ? `${actor} ${changes.join(', ')}` : `${actor} edited ${name}`;
}
