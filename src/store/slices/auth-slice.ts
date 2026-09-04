import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { clearCachedUser, readCachedUser, writeCachedUser } from '@/lib/api-config';
import type { Role } from '@/lib/constants';
import type { AuthUser } from '@/lib/types';

/**
 * Who is signed in on this shared device.
 *
 * Note what is *not* here: a token. The session lives in an httpOnly cookie the
 * browser attaches by itself, so this slice only ever holds the operator's
 * identity — useful for rendering, worthless to an attacker.
 *
 * Devices are shared (one waiter phone, one kitchen tablet), so this is really
 * "who is on this device right now". Every write still carries that operator's
 * id into the audit log.
 */

interface AuthState {
  user: AuthUser | null;
  /**
   * False until the boot-time check has run.
   *
   * Guards wait on this so a signed-in tablet does not flash the PIN pad for a
   * frame on every reload.
   */
  isHydrated: boolean;
}

const initialState: AuthState = { user: null, isHydrated: false };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** After a successful PIN login. The cookie is already set by then. */
    signedIn(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      state.isHydrated = true;
      writeCachedUser(action.payload);
    },

    /**
     * Optimistic restore from the cached identity, before `/auth/me` answers.
     *
     * Deliberately does *not* set `isHydrated`: this only decides which
     * skeleton to paint. The cookie check is what actually confirms the
     * session, and `profileConfirmed` / `signedOut` settle it.
     */
    cachedUserRestored(state) {
      state.user ??= readCachedUser<AuthUser>();
    },

    /** `/auth/me` answered — this is the authoritative "yes, still signed in". */
    profileConfirmed(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      state.isHydrated = true;
      writeCachedUser(action.payload);
    },

    /** Sign-out, and the landing point for any 401 from the API. */
    signedOut(state) {
      state.user = null;
      state.isHydrated = true;
      clearCachedUser();
    },
  },
});

/** Admin sees every screen; everyone else sees their own. */
export function canAccess(user: AuthUser | null, allowed: Role[]): boolean {
  if (!user) return false;
  return user.role === 'admin' || allowed.includes(user.role);
}

export const { signedIn, cachedUserRestored, profileConfirmed, signedOut } = authSlice.actions;
export default authSlice.reducer;
