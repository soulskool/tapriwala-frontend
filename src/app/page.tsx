'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { IconBill, IconFloor, IconKitchen, IconOverview } from '@/components/ui/icons';
import { ROLE_HOME, ROLES } from '@/lib/constants';
import { useAppSelector } from '@/store/hooks';

const ENTRY_POINTS = [
  {
    href: ROLE_HOME[ROLES.WAITER],
    label: 'Floor',
    icon: IconFloor,
    blurb: 'Live table grid and ordering',
  },
  {
    href: ROLE_HOME[ROLES.KITCHEN],
    label: 'Kitchen',
    icon: IconKitchen,
    blurb: 'Live ticket board',
  },
  {
    href: ROLE_HOME[ROLES.BILLING],
    label: 'Billing',
    icon: IconBill,
    blurb: 'Consolidate and close',
  },
  {
    href: ROLE_HOME[ROLES.ADMIN],
    label: 'Admin',
    icon: IconOverview,
    blurb: 'Overview and master data',
  },
];

/**
 * The root URL.
 *
 * Guests never land here — a scanned sticker goes straight to
 * `/order/<tableCode>`. This is the device that was opened without a bookmark,
 * so it sends a signed-in operator to their own screen and everyone else to
 * the PIN pad.
 */
export default function HomePage() {
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);

  useEffect(() => {
    if (user) router.replace(ROLE_HOME[user.role]);
  }, [user, router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-5 py-12">
      <div className="text-center">
        <div className="bg-brand-600 mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl text-3xl shadow-lg">
          ☕
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Tapriwala by Treatmeets</h1>
        <p className="text-ink-muted mt-2">Ordering, kitchen display and billing</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ENTRY_POINTS.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="rounded-card border-line bg-surface hover:border-brand-300 hover:bg-brand-50 flex items-center gap-3 border px-4 py-4 transition"
          >
            <entry.icon aria-hidden className="text-brand-600 size-6 shrink-0" />
            <span>
              <span className="block font-semibold">{entry.label}</span>
              <span className="text-ink-muted block text-sm">{entry.blurb}</span>
            </span>
          </Link>
        ))}
      </div>

      <p className="text-ink-muted text-center text-sm">
        Guests scan the QR sticker on their table — no sign-in needed.
      </p>
    </main>
  );
}
