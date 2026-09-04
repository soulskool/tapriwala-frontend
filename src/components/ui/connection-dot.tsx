'use client';

import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';

const STATE = {
  online: { className: 'bg-status-ready', label: 'Live' },
  connecting: { className: 'bg-status-pending animate-pulse', label: 'Connecting…' },
  offline: { className: 'bg-status-cancelled', label: 'Offline' },
} as const;

/**
 * Realtime health, always visible in the header.
 *
 * Not decoration: if the socket is down the screen is stale, and staff need to
 * know that before they trust what a tile is telling them. When it goes red,
 * every screen still works — it just falls back to REST on refresh.
 */
export function ConnectionDot({ className }: { className?: string }) {
  const connection = useAppSelector((state) => state.ui.connection);
  const state = STATE[connection];

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium', className)}
      title={`Realtime connection: ${state.label}`}
    >
      <span aria-hidden className={cn('size-2 rounded-full', state.className)} />
      <span>{state.label}</span>
    </span>
  );
}
