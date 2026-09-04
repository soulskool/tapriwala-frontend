'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { LoadingBlock } from '@/components/ui/feedback';
import type { Role } from '@/lib/constants';
import { useMeQuery } from '@/store/api/auth-api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { canAccess, profileConfirmed, signedOut } from '@/store/slices/auth-slice';
import { useSocketSync } from '@/store/socket/use-socket-sync';

interface AuthGuardProps {
  allow: Role[];
  children: ReactNode;
}

/**
 * Gates a staff screen and opens its realtime connection.
 *
 * With the session in an httpOnly cookie there is no token to inspect, so
 * "am I signed in?" is a question only the server can answer: `/auth/me` is
 * the check. That is strictly better than trusting a value in storage — it
 * also catches a deactivated account mid-shift, which a local token cannot.
 *
 * This remains a client-side guard for UX, not a security boundary. Every
 * endpoint behind it re-checks the role server-side; hiding a button the API
 * would refuse anyway is a courtesy.
 */
export function AuthGuard({ allow, children }: AuthGuardProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);

  const { data: profile, isError, isLoading } = useMeQuery();

  // The socket authenticates by the same cookie, so it can open as soon as
  // this screen mounts; the server rejects it if the cookie is not valid.
  useSocketSync({ staff: true });

  useEffect(() => {
    if (profile) dispatch(profileConfirmed(profile));
  }, [profile, dispatch]);

  useEffect(() => {
    if (isError) {
      dispatch(signedOut());
      router.replace('/login');
    }
  }, [isError, dispatch, router]);

  const permitted = canAccess(user, allow);

  useEffect(() => {
    if (isLoading || !user) return;
    if (!permitted) router.replace('/login?denied=1');
  }, [isLoading, user, permitted, router]);

  // The cached identity (written at login, never the credential) lets a
  // reloaded tablet paint its own screen while `/auth/me` is still in flight,
  // instead of flashing the PIN pad on every refresh.
  if (isLoading && !user) return <LoadingBlock label="Starting up…" />;
  if (!user || !permitted) return <LoadingBlock label="Checking access…" />;

  return <>{children}</>;
}
