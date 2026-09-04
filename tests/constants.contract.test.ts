import { describe, expect, it } from 'vitest';

import * as backend from '../../backend/src/config/constants';
import * as frontend from '@/lib/constants';

/**
 * The contract between the two apps.
 *
 * `frontend/src/lib/constants.ts` and `backend/src/config/constants.ts` are
 * hand-mirrored, and the whole system rests on them agreeing: a socket event
 * renamed on one side and not the other means a kitchen board that silently
 * stops updating — no error, no failed build, just a tablet that goes quiet
 * mid-service. TypeScript cannot catch that across two packages, so this test
 * does.
 *
 * It compares *values*, never labels or copy. The frontend is allowed to hold
 * extra UI-only constants (thresholds, cart limits, route homes); what it may
 * not do is disagree about a value the wire depends on.
 *
 * Room names are deliberately NOT compared: the client never builds one. It
 * emits JOIN_TABLE/JOIN_SESSION with a bare id and the server derives the room,
 * so `SOCKET_ROOMS` exists only on the backend.
 */

/** Every shared enum, checked whole. */
const SHARED_ENUMS = {
  ROLES: [frontend.ROLES, backend.ROLES],
  TABLE_ZONES: [frontend.TABLE_ZONES, backend.TABLE_ZONES],
  KITCHEN_STATIONS: [frontend.KITCHEN_STATIONS, backend.KITCHEN_STATIONS],
  SESSION_STATUS: [frontend.SESSION_STATUS, backend.SESSION_STATUS],
  ORDER_SOURCE: [frontend.ORDER_SOURCE, backend.ORDER_SOURCE],
  ITEM_STATUS: [frontend.ITEM_STATUS, backend.ITEM_STATUS],
  SERVICE_REQUEST_TYPE: [frontend.SERVICE_REQUEST_TYPE, backend.SERVICE_REQUEST_TYPE],
  SERVICE_REQUEST_STATUS: [frontend.SERVICE_REQUEST_STATUS, backend.SERVICE_REQUEST_STATUS],
  EXPORT_METHOD: [frontend.EXPORT_METHOD, backend.EXPORT_METHOD],
  EXPORT_STATUS: [frontend.EXPORT_STATUS, backend.EXPORT_STATUS],
  SOCKET_EVENTS: [frontend.SOCKET_EVENTS, backend.SOCKET_EVENTS],
} as const;

describe('frontend/backend constant contract', () => {
  for (const [name, [ours, theirs]] of Object.entries(SHARED_ENUMS)) {
    it(`${name} is identical on both sides`, () => {
      expect(ours).toEqual(theirs);
    });
  }

  it('ROUND_STATUS agrees, even though the two files build it differently', () => {
    // The frontend aliases ROUND_STATUS to ITEM_STATUS; the backend spells it
    // out. That is fine as long as they still resolve to the same values.
    expect(frontend.ROUND_STATUS).toEqual(backend.ROUND_STATUS);
  });

  it('KITCHEN_SETTABLE_STATUSES matches — the KDS must not offer a status the API rejects', () => {
    expect([...frontend.KITCHEN_SETTABLE_STATUSES].sort()).toEqual(
      [...backend.KITCHEN_SETTABLE_STATUSES].sort(),
    );
  });

  it('every error code the frontend handles is one the backend can actually send', () => {
    // One-directional on purpose: the backend may define codes the UI has no
    // special case for, but a frontend code with no backend counterpart is a
    // branch that can never run.
    const theirs = new Set(Object.values(backend.ERROR_CODES));
    for (const code of Object.values(frontend.ERROR_CODES)) {
      expect(theirs, `frontend ERROR_CODES.${code} has no backend counterpart`).toContain(code);
    }
  });
});
