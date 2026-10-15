import { describe, expect, it } from 'vitest';

import { ROLES } from '@/lib/constants';
import type { AuthUser } from '@/lib/types';
import reducer, {
  canAccess,
  canManageStaff,
  canWrite,
  cachedUserRestored,
  profileConfirmed,
  signedIn,
  signedOut,
} from '@/store/slices/auth-slice';

/**
 * Role gating and the sign-in lifecycle.
 *
 * `canAccess` is what stands between a waiter and the "free this table without
 * charging" button. It is four lines long, which is exactly why it deserves a
 * test — nobody reviews four lines carefully, and getting it backwards would
 * hand every role every screen without anything visibly breaking.
 */

const user = (role: AuthUser['role']): AuthUser => ({ id: 'u1', name: 'Test', role });

describe('canAccess', () => {
  it('refuses a signed-out visitor', () => {
    expect(canAccess(null, [ROLES.WAITER])).toBe(false);
  });

  it('lets a role through its own screens', () => {
    expect(canAccess(user(ROLES.WAITER), [ROLES.WAITER])).toBe(true);
    expect(canAccess(user(ROLES.KITCHEN), [ROLES.KITCHEN, ROLES.WAITER])).toBe(true);
  });

  it('keeps a role out of screens it was not granted', () => {
    // The case that matters: a waiter must not reach billing-only actions.
    expect(canAccess(user(ROLES.WAITER), [ROLES.BILLING])).toBe(false);
    expect(canAccess(user(ROLES.KITCHEN), [ROLES.BILLING])).toBe(false);
  });

  it('gives admin a bypass everywhere, matching the backend authorize()', () => {
    expect(canAccess(user(ROLES.ADMIN), [ROLES.BILLING])).toBe(true);
    expect(canAccess(user(ROLES.ADMIN), [])).toBe(true);
  });

  it('gives super admin and the view-only admin every screen too', () => {
    // Seeing is shared by all three admin roles; acting is not (below).
    for (const role of [ROLES.SUPER_ADMIN, ROLES.ADMIN_VIEWER]) {
      expect(canAccess(user(role), [ROLES.BILLING])).toBe(true);
      expect(canAccess(user(role), [ROLES.KITCHEN, ROLES.WAITER])).toBe(true);
      expect(canAccess(user(role), [])).toBe(true);
    }
  });
});

describe('canWrite', () => {
  it('refuses a signed-out visitor', () => {
    expect(canWrite(null)).toBe(false);
  });

  it('refuses only the view-only admin', () => {
    // Getting this backwards hides every button from the whole floor, or
    // hands the view-only account a screen full of buttons that all 403.
    expect(canWrite(user(ROLES.ADMIN_VIEWER))).toBe(false);
    for (const role of [
      ROLES.WAITER,
      ROLES.KITCHEN,
      ROLES.BILLING,
      ROLES.ADMIN,
      ROLES.SUPER_ADMIN,
    ]) {
      expect(canWrite(user(role)), role).toBe(true);
    }
  });
});

describe('canManageStaff', () => {
  it('is super admin only — no admin bypass, matching requireRole() on the API', () => {
    expect(canManageStaff(user(ROLES.SUPER_ADMIN))).toBe(true);
    for (const role of [
      ROLES.ADMIN,
      ROLES.ADMIN_VIEWER,
      ROLES.WAITER,
      ROLES.KITCHEN,
      ROLES.BILLING,
    ]) {
      expect(canManageStaff(user(role)), role).toBe(false);
    }
    expect(canManageStaff(null)).toBe(false);
  });
});

describe('auth lifecycle', () => {
  const initial = { user: null, isHydrated: false };

  it('starts un-hydrated so a guard paints a skeleton, not the PIN pad', () => {
    // Flashing the PIN pad for a frame on every reload of a signed-in tablet
    // is the bug this flag exists to prevent.
    expect(initial.isHydrated).toBe(false);
  });

  it('marks hydrated on sign-in', () => {
    const next = reducer(initial, signedIn(user(ROLES.WAITER)));
    expect(next.user?.role).toBe(ROLES.WAITER);
    expect(next.isHydrated).toBe(true);
  });

  it('does NOT mark hydrated on an optimistic cache restore', () => {
    // Only /auth/me is authoritative. Treating the cache as confirmation would
    // leave a revoked user apparently signed in.
    const next = reducer(initial, cachedUserRestored());
    expect(next.isHydrated).toBe(false);
  });

  it('never lets a cache restore overwrite a confirmed user', () => {
    const confirmed = reducer(initial, profileConfirmed(user(ROLES.BILLING)));
    const after = reducer(confirmed, cachedUserRestored());
    expect(after.user?.role).toBe(ROLES.BILLING);
  });

  it('clears the user on sign-out but stays hydrated', () => {
    const signedInState = reducer(initial, signedIn(user(ROLES.ADMIN)));
    const next = reducer(signedInState, signedOut());
    expect(next.user).toBeNull();
    expect(next.isHydrated).toBe(true);
    // And the gate closes immediately.
    expect(canAccess(next.user, [ROLES.ADMIN])).toBe(false);
  });
});
