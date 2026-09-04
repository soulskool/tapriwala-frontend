import type { Metadata } from 'next';

import { LoginClient } from './login-client';

export const metadata: Metadata = { title: 'Staff sign in' };

/**
 * Server shell for the PIN pad.
 *
 * `searchParams` is awaited here rather than read with `useSearchParams` in the
 * client, which keeps the form out of a Suspense boundary it does not need.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;

  return (
    <main className="from-brand-50 to-surface-muted flex min-h-dvh items-center justify-center bg-gradient-to-b px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="bg-brand-600 mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl text-2xl shadow-lg">
            ☕
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ACD Cafe</h1>
          <p className="text-ink-muted mt-1 text-sm">Sign in to your shift</p>
        </div>

        <LoginClient wasDenied={denied === '1'} />
      </div>
    </main>
  );
}
