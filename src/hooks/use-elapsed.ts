'use client';

import { useEffect, useReducer } from 'react';

import { UI_THRESHOLDS } from '@/lib/constants';
import { minutesSince } from '@/lib/utils';

/**
 * Minutes since a timestamp, recomputed on a timer.
 *
 * The KDS requirement is that a ticket's age climbs on screen without anyone
 * touching the tablet, so the kitchen can prioritise a delayed order before
 * being asked about it.
 *
 * One interval per hook call is fine at café scale (a board holds tens of
 * tickets, not thousands) and keeps each card independent and readable.
 */
export function useElapsedMinutes(
  since: string | null | undefined,
  intervalMs: number = UI_THRESHOLDS.ELAPSED_TICK_MS,
): number {
  const [, tick] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (!since) return;

    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [since, intervalMs]);

  // Derived at render rather than held in state, so the first paint is already
  // correct — a ticket must never flash "just now" when it is 20 minutes old.
  // The interval above only forces the re-render; it does not own the value.
  return minutesSince(since);
}

/**
 * How urgent a ticket looks, derived from its age.
 *
 * Returned as a name rather than a colour so the caller decides the treatment
 * — the KDS uses a border, the table grid uses a badge.
 */
export type Urgency = 'normal' | 'urgent' | 'late';

export function urgencyFor(minutes: number): Urgency {
  if (minutes >= UI_THRESHOLDS.TICKET_LATE_MINUTES) return 'late';
  if (minutes >= UI_THRESHOLDS.TICKET_URGENT_MINUTES) return 'urgent';
  return 'normal';
}
