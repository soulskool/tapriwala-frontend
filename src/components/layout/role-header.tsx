'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  IconAudit,
  IconBill,
  IconBilled,
  IconClose,
  IconFloor,
  IconKitchen,
  IconMenuToggle,
  IconOverview,
  IconProducts,
  IconStaff,
  IconTables,
  type IconType,
} from '@/components/ui/icons';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConnectionDot } from '@/components/ui/connection-dot';
import { Modal } from '@/components/ui/modal';
import { ROLES } from '@/lib/constants';
import { cn, initials } from '@/lib/utils';
import { useSignOut } from '@/hooks/use-sign-out';
import { useAppSelector } from '@/store/hooks';

interface NavItem {
  href: string;
  label: string;
  icon: IconType;
}

/**
 * Which screens each role sees.
 *
 * Admin is given the operational screens too, not just its own — §10 asks for
 * live ops visibility so ownership never has to interrupt staff to find out
 * what is happening on the floor.
 */
const NAV_BY_ROLE: Record<string, NavItem[]> = {
  [ROLES.WAITER]: [
    { href: '/waiter', label: 'Floor', icon: IconFloor },
    // Read-only bill history, so a waiter can settle a "what did we pay?"
    // question at the table rather than at the counter.
    { href: '/waiter/bills', label: 'Billed', icon: IconBilled },
  ],
  [ROLES.KITCHEN]: [{ href: '/kitchen', label: 'Kitchen', icon: IconKitchen }],
  [ROLES.BILLING]: [
    { href: '/billing', label: 'Billing', icon: IconBill },
    { href: '/waiter', label: 'Floor', icon: IconFloor },
    { href: '/waiter/bills', label: 'Billed', icon: IconBilled },
  ],
  [ROLES.ADMIN]: [
    { href: '/admin', label: 'Overview', icon: IconOverview },
    { href: '/waiter', label: 'Floor', icon: IconFloor },
    { href: '/kitchen', label: 'Kitchen', icon: IconKitchen },
    { href: '/billing', label: 'Billing', icon: IconBill },
    { href: '/waiter/bills', label: 'Billed', icon: IconBilled },
    { href: '/admin/products', label: 'Menu', icon: IconProducts },
    { href: '/admin/tables', label: 'Tables', icon: IconTables },
    { href: '/admin/users', label: 'Staff', icon: IconStaff },
    { href: '/admin/audit', label: 'Audit', icon: IconAudit },
  ],
};

interface RoleHeaderProps {
  title: string;
  /**
   * Puts a confirmation in front of signing out.
   *
   * For the wall-mounted kitchen tablet, where the button sits at knuckle
   * height and signing the whole kitchen out mid-service costs a great deal
   * more than one extra tap does.
   */
  confirmSignOut?: boolean;
}

export function RoleHeader({ title, confirmSignOut = false }: RoleHeaderProps) {
  const pathname = usePathname();
  const user = useAppSelector((state) => state.auth.user);
  const { signOut, isSigningOut } = useSignOut();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = user ? (NAV_BY_ROLE[user.role] ?? []) : [];
  /*
   * Longest match wins.
   *
   * `/waiter/bills` is also a prefix match for `/waiter`, so a plain `find`
   * would light up "Floor" and title the page "Floor" while the user is
   * looking at the bill history. Sorting by href length picks the most
   * specific destination instead.
   */
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = [...nav]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActive(item.href));

  return (
    <header className="border-line bg-surface/95 print-hidden sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
        {/*
         * The menu button is first in the DOM and mobile-only. Admin carries
         * eight destinations, which on a 360px phone used to be a horizontal
         * scroller with no affordance — half the app was reachable only by
         * guessing it could be swiped.
         */}
        {nav.length > 1 ? (
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="role-nav-sheet"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="border-line hover:bg-surface-sunken min-h-touch min-w-touch flex items-center justify-center rounded-lg border text-lg lg:hidden"
          >
            {menuOpen ? (
              <IconClose aria-hidden className="size-5" />
            ) : (
              <IconMenuToggle aria-hidden className="size-5" />
            )}
          </button>
        ) : null}

        <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">
          {/* On a phone the current screen is more useful than the role name. */}
          <span className="lg:hidden">{current?.label ?? title}</span>
          <span className="hidden lg:inline">{title}</span>
        </h1>

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.href === current?.href ? 'page' : undefined}
              className={cn(
                'flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium whitespace-nowrap transition',
                item.href === current?.href
                  ? 'bg-brand-100 text-brand-800'
                  : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
              )}
            >
              <item.icon aria-hidden className="size-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Spacer so the avatar stays right-aligned once the nav is hidden. */}
        <div className="flex-1 lg:hidden" />

        <ConnectionDot className="text-ink-muted hidden sm:inline-flex" />

        {user ? (
          <div className="flex items-center gap-2">
            <span
              title={`${user.name} · ${user.role}`}
              className="bg-brand-600 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            >
              {initials(user.name)}
            </span>
            <button
              type="button"
              onClick={confirmSignOut ? () => setConfirmOpen(true) : () => void signOut()}
              disabled={isSigningOut}
              className="text-ink-muted hover:bg-surface-sunken hover:text-ink hidden min-h-9 rounded-lg px-2 text-sm font-medium disabled:opacity-50 sm:block"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>

      {/*
       * The mobile sheet. A vertical list with full-width targets, rather than
       * a scroller — every destination is visible at once and each one is a
       * comfortable thumb tap.
       */}
      {menuOpen ? (
        <nav
          id="role-nav-sheet"
          className="border-line bg-surface max-h-[70vh] overflow-y-auto border-t px-3 py-2 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={item.href === current?.href ? 'page' : undefined}
                  className={cn(
                    'min-h-touch flex items-center gap-3 rounded-lg px-3 text-base font-medium transition',
                    item.href === current?.href
                      ? 'bg-brand-100 text-brand-800'
                      : 'text-ink hover:bg-surface-sunken',
                  )}
                >
                  <item.icon aria-hidden className="size-5 shrink-0" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="border-line mt-2 flex items-center justify-between gap-2 border-t pt-2">
            <ConnectionDot className="text-ink-muted" />
            <button
              type="button"
              onClick={confirmSignOut ? () => setConfirmOpen(true) : () => void signOut()}
              disabled={isSigningOut}
              className="text-ink-muted hover:bg-surface-sunken hover:text-ink min-h-touch rounded-lg px-3 text-sm font-medium disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
        </nav>
      ) : null}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Sign out of this device?"
        description="Nothing in progress is lost — orders and tickets live on the server. The next person signs in with their own PIN, so their taps are logged against them."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Stay signed in
            </Button>
            <Button variant="danger" isLoading={isSigningOut} onClick={() => void signOut()}>
              Sign out
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Signed in as <span className="font-semibold">{user?.name ?? 'unknown'}</span>.
        </p>
      </Modal>
    </header>
  );
}
