'use client';

import { useAppSelector } from '@/store/hooks';
import { canWrite } from '@/store/slices/auth-slice';

/**
 * False for the view-only admin, true for everyone else who is signed in.
 *
 * Screens use it to hide every control that changes something. The backend
 * refuses those writes whatever this returns; hiding them only spares a
 * view-only admin a button that always fails — and, on the taps that update
 * optimistically, a change that flashes on screen and then rolls back.
 */
export function useCanWrite(): boolean {
  return canWrite(useAppSelector((state) => state.auth.user));
}
