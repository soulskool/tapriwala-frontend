'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { useLogoutMutation } from '@/store/api/auth-api';
import { useAppDispatch } from '@/store/hooks';
import { signedOut } from '@/store/slices/auth-slice';

/**
 * Ends the shift on this device.
 *
 * Lives in one hook because more than one screen needs it, and the last time
 * it existed in only one place (`RoleHeader`) the kitchen — which renders no
 * header — had no way out at all.
 *
 * The local sign-out happens even if the request fails: a shared device must
 * not stay signed in because the Wi-Fi dropped at shift change. The cookie is
 * `httpOnly`, so the server clearing it is what truly ends the session, but a
 * device that cannot reach the server should still lock its screen.
 */
export function useSignOut() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [logout, { isLoading }] = useLogoutMutation();

  const signOut = useCallback(async () => {
    await logout()
      .unwrap()
      .catch(() => undefined);
    dispatch(signedOut());
    router.replace('/login');
  }, [logout, dispatch, router]);

  return { signOut, isSigningOut: isLoading };
}
