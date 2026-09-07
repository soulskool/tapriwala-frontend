import type { ReactNode } from 'react';

import { IconWarning } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * The four "nothing useful on screen yet" states, kept together because they
 * are always chosen between: loading, empty, error, or a skeleton.
 */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="text-ink-muted flex flex-col items-center justify-center gap-3 py-16">
      <Spinner className="size-7" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** A grey box the size of the thing that is coming. Avoids layout shift. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('bg-surface-sunken animate-pulse rounded-lg', className)} />;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-card border-line bg-surface flex flex-col items-center justify-center gap-2 border border-dashed px-6 py-14 text-center">
      {icon ? <div className="text-4xl opacity-60">{icon}</div> : null}
      <h3 className="text-ink text-base font-semibold">{title}</h3>
      {description ? <p className="text-ink-muted max-w-sm text-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

/**
 * A failed fetch, with the server's own sentence.
 *
 * The backend writes messages meant for staff, so the job here is to show them
 * rather than replace them with "Something went wrong".
 */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-card border-status-cancelled/30 bg-status-cancelled-soft flex flex-col items-center gap-3 border px-6 py-10 text-center"
    >
      <IconWarning aria-hidden className="text-status-cancelled size-8" />
      <p className="text-status-cancelled-ink text-sm font-medium">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-touch border-status-cancelled/40 bg-surface text-status-cancelled-ink rounded-xl border px-4 text-sm font-semibold"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
