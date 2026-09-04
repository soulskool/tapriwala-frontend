import { describe, expect, it } from 'vitest';

import {
  ITEM_STATUS,
  KITCHEN_SETTABLE_STATUSES,
  LIVE_ITEM_STATUSES,
  ROLES,
  ROLE_HOME,
  ROLE_VALUES,
  ROUND_STATUS,
  SERVICE_REQUEST_TYPE,
  SESSION_STATUS,
  SOCKET_EVENTS,
  TABLE_ZONES,
  ZONE_DISPLAY_ORDER,
} from '@/lib/constants';
import {
  ITEM_STATUS_LABEL,
  SERVICE_REQUEST_ICON,
  SERVICE_REQUEST_LABEL,
  TILE_STATUS_LABEL,
} from '@/lib/utils';

/**
 * Internal consistency of the domain constants.
 *
 * Everything here stays inside this app — nothing reaches across to the
 * backend, so the suite runs on a machine where only the frontend is deployed.
 *
 * What it catches is the second half of a two-line change: someone adds a
 * status, wires it into a list, and forgets the label map. TypeScript's
 * `Record<Status, string>` catches that one, but not a status dropped from a
 * *list*, and not a socket event name typed twice. Those fail silently — a
 * blank tile, or a handler that never fires.
 */

describe('roles', () => {
  it('gives every role somewhere to land after login', () => {
    // A role with no home sends the user to `undefined` on sign-in.
    for (const role of ROLE_VALUES) {
      expect(ROLE_HOME[role], `no ROLE_HOME entry for "${role}"`).toBeTruthy();
      expect(ROLE_HOME[role].startsWith('/')).toBe(true);
    }
  });

  it('has no duplicate role values', () => {
    const values = Object.values(ROLES);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('statuses', () => {
  it('labels every item status', () => {
    // A missing label renders an empty badge — colour with no text, which is
    // exactly what the colour-blind rule exists to prevent.
    for (const status of Object.values(ITEM_STATUS)) {
      expect(ITEM_STATUS_LABEL[status], `no label for item status "${status}"`).toBeTruthy();
    }
  });

  it('labels every tile status, including the synthetic empty one', () => {
    for (const status of Object.values(SESSION_STATUS)) {
      expect(TILE_STATUS_LABEL[status], `no label for session status "${status}"`).toBeTruthy();
    }
    expect(TILE_STATUS_LABEL.empty).toBeTruthy();
  });

  it('keeps ROUND_STATUS aliased to ITEM_STATUS', () => {
    // Round status is derived from item status server-side. If these ever
    // diverge, a derived value stops matching anything the UI can render.
    expect(ROUND_STATUS).toBe(ITEM_STATUS);
  });

  it('only lets the kitchen set real item statuses', () => {
    const known = new Set<string>(Object.values(ITEM_STATUS));
    for (const status of KITCHEN_SETTABLE_STATUSES) {
      expect(known, `KDS offers "${status}", which is not an item status`).toContain(status);
    }
  });

  it('never offers the kitchen a terminal status', () => {
    // Cancel is a separate, audited action with a reason; served is the
    // waiter's call. Neither belongs on the three-button KDS ticket.
    expect(KITCHEN_SETTABLE_STATUSES).not.toContain(ITEM_STATUS.CANCELLED);
    expect(KITCHEN_SETTABLE_STATUSES).not.toContain(ITEM_STATUS.SERVED);
  });

  it('counts exactly the statuses that still owe the guest food', () => {
    // served and cancelled owe nothing; everything else does.
    expect([...LIVE_ITEM_STATUSES].sort()).toEqual(
      Object.values(ITEM_STATUS)
        .filter((status) => status !== ITEM_STATUS.SERVED && status !== ITEM_STATUS.CANCELLED)
        .sort(),
    );
  });
});

describe('service requests', () => {
  it('gives every request type both a label and an icon', () => {
    // The icon is the non-colour channel on a request chip; without it the
    // chip is distinguishable by hue alone.
    for (const type of Object.values(SERVICE_REQUEST_TYPE)) {
      expect(SERVICE_REQUEST_LABEL[type], `no label for "${type}"`).toBeTruthy();
      expect(SERVICE_REQUEST_ICON[type], `no icon for "${type}"`).toBeTruthy();
    }
  });
});

describe('zones', () => {
  it('orders every zone exactly once', () => {
    // A zone missing here renders after the ordered ones or not at all,
    // depending on the screen — either way the floor plan stops matching the
    // room.
    expect([...ZONE_DISPLAY_ORDER].sort()).toEqual(Object.values(TABLE_ZONES).sort());
    expect(new Set(ZONE_DISPLAY_ORDER).size).toBe(ZONE_DISPLAY_ORDER.length);
  });
});

describe('socket events', () => {
  it('has no duplicate event names', () => {
    // Two keys sharing a wire name means one handler quietly shadows the
    // other, and the board stops updating for whichever lost.
    const values = Object.values(SOCKET_EVENTS);
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    expect(duplicates, `duplicated socket event names: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('namespaces every event name', () => {
    // `round:new`, `session:closed`, `app:error` — the prefix is what keeps
    // the contract readable and collision-free as it grows.
    for (const event of Object.values(SOCKET_EVENTS)) {
      // Both halves are camelCase — `serviceRequest:new`, `round:itemStatus`.
      expect(event, `"${event}" has no namespace prefix`).toMatch(/^[a-zA-Z]+:[a-zA-Z]+$/);
    }
  });
});
