'use client';

import { memo } from 'react';

import { useElapsedMinutes, urgencyFor } from '@/hooks/use-elapsed';
import { cn, formatElapsed } from '@/lib/utils';

const URGENCY_STYLE = {
  normal: 'text-ink-muted',
  urgent: 'text-status-pending',
  late: 'text-status-cancelled',
} as const;

/**
 * A ticket's age, climbing on its own.
 *
 * Requirement 2a: the kitchen must be able to spot a delayed order without
 * anyone coming to ask about it, so this recomputes on a timer rather than
 * only when data arrives.
 */
function ElapsedTimerComponent({ since, className }: { since: string; className?: string }) {
  const minutes = useElapsedMinutes(since);
  const urgency = urgencyFor(minutes);

  return (
    <span
      className={cn('font-bold tabular-nums', URGENCY_STYLE[urgency], className)}
      title={`Placed ${minutes} minute(s) ago`}
    >
      {formatElapsed(minutes)}
    </span>
  );
}

export const ElapsedTimer = memo(ElapsedTimerComponent);
