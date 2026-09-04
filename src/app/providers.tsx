'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';

import { ToastHost } from '@/components/ui/toast-host';
import { makeStore, type AppStore } from '@/store';
import { AUTH_EXPIRED_EVENT } from '@/store/api/base-query';
import { cachedUserRestored, signedOut } from '@/store/slices/auth-slice';
import { cartsHydrated } from '@/store/slices/cart-slice';

/**
 * Everything client-side that must exist above every route.
 *
 * The store is created per mount rather than at module scope: Next renders
 * this tree on the server too, and a module-level singleton would let one
 * request's data leak into the next.
 */
export function Providers({ children }: { children: ReactNode }) {
  // Lazy initialiser, so the store is built exactly once per mount and never
  // read during render the way a ref would be.
  const [store] = useState<AppStore>(makeStore);

  useEffect(() => {
    // Restores the cached *identity* only — the session itself is an httpOnly
    // cookie this app cannot see. `AuthGuard` confirms it against `/auth/me`;
    // this just decides which screen to paint in the meantime, so a reloaded
    // tab does not flash the PIN pad on its way back to the board it was on.
    store.dispatch(cachedUserRestored());
    store.dispatch(cartsHydrated());
  }, [store]);

  useEffect(() => {
    // A 401 from anywhere means the shift's session died. One listener, so
    // every screen reacts the same way instead of each rendering empty lists.
    const onExpired = () => store.dispatch(signedOut());
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [store]);

  return (
    <Provider store={store}>
      {children}
      <ToastHost />
    </Provider>
  );
}
