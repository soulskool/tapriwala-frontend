'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useSignOut } from '@/hooks/use-sign-out';
import { ROLE_HOME } from '@/lib/constants';
import { useLoginMutation } from '@/store/api/auth-api';
import { apiErrorMessage, apiFieldErrors } from '@/store/api/base-query';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { signedIn } from '@/store/slices/auth-slice';

/**
 * PIN login for shared devices.
 *
 * Phone plus a 4-digit PIN, because these are counter PCs and pooled phones
 * handed between shifts. Low friction, but every action the device takes is
 * still attributed to whoever signed in.
 */
export function LoginClient({ wasDenied }: { wasDenied: boolean }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [login, { isLoading, error }] = useLoginMutation();

  const user = useAppSelector((state) => state.auth.user);
  const { signOut, isSigningOut } = useSignOut();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');

  const fieldErrors = apiFieldErrors(error);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isLoading) return;

    const result = await login({ phone: phone.trim(), pin })
      .unwrap()
      .catch(() => null);
    if (!result) return;

    // The session cookie was set by this response. Only the identity is kept
    // here — the token in the body is for native clients and is ignored.
    dispatch(signedIn(result.user));
    router.replace(ROLE_HOME[result.user.role]);
  }

  /**
   * Already signed in.
   *
   * Shown rather than silently redirected, and that is the point: a screen
   * without a visible sign-out (the kitchen board) plus a login page that
   * bounces you back to it is a trap with no way out. This page is the one
   * guaranteed escape hatch, so it always offers a choice.
   */
  if (user) {
    return (
      <div className="rounded-card border-line bg-surface flex flex-col gap-4 border p-6 text-center shadow-sm">
        <div>
          <p className="text-ink-muted text-sm">Already signed in as</p>
          <p className="text-lg font-bold">{user.name}</p>
          <p className="text-ink-muted text-sm capitalize">{user.role}</p>
        </div>

        <Button size="lg" fullWidth onClick={() => router.replace(ROLE_HOME[user.role])}>
          Continue
        </Button>
        <Button
          variant="secondary"
          fullWidth
          isLoading={isSigningOut}
          onClick={() => void signOut()}
        >
          Sign out and switch user
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="rounded-card border-line bg-surface flex flex-col gap-4 border p-6 shadow-sm"
    >
      {wasDenied ? (
        <p
          role="alert"
          className="bg-status-pending-soft text-status-pending-ink rounded-xl px-3 py-2 text-sm"
        >
          That screen is not available for your role. Sign in with an account that has access.
        </p>
      ) : null}

      <TextField
        label="Phone number"
        name="phone"
        type="tel"
        inputMode="numeric"
        autoComplete="username"
        placeholder="9999999999"
        required
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        error={fieldErrors.phone}
      />

      <TextField
        label="PIN"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        placeholder="••••"
        maxLength={4}
        required
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
        error={fieldErrors.pin}
        hint="4 digits"
      />

      {error && Object.keys(fieldErrors).length === 0 ? (
        <p role="alert" className="text-status-cancelled-ink text-sm font-medium">
          {apiErrorMessage(error, 'Could not sign in')}
        </p>
      ) : null}

      <Button type="submit" size="lg" fullWidth isLoading={isLoading}>
        Sign in
      </Button>
    </form>
  );
}
