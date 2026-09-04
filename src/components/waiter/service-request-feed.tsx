'use client';

import Link from 'next/link';

import { EmptyState } from '@/components/ui/feedback';
import { SERVICE_REQUEST_STATUS } from '@/lib/constants';
import type { ServiceRequest } from '@/lib/types';
import { SERVICE_REQUEST_ICON, SERVICE_REQUEST_LABEL, cn, formatElapsed } from '@/lib/utils';

interface ServiceRequestFeedProps {
  requests: ServiceRequest[];
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
  busyId?: string | null;
}

/**
 * The waiter's live call list, oldest first.
 *
 * `isEscalated` is computed by the server against the café's own threshold, so
 * this component never guesses at what "too long" means — it just makes the
 * escalated ones impossible to miss.
 */
export function ServiceRequestFeed({
  requests,
  onAcknowledge,
  onResolve,
  busyId,
}: ServiceRequestFeedProps) {
  if (requests.length === 0) {
    return (
      <EmptyState
        icon="✓"
        title="No one is waiting"
        description="Water, call-staff and bill requests appear here the moment a guest taps."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {requests.map((request) => {
        const id = request.requestId ?? request._id ?? '';
        const acknowledged = request.status === SERVICE_REQUEST_STATUS.ACKNOWLEDGED;

        return (
          <li
            key={id}
            className={cn(
              'rounded-card bg-surface flex items-center gap-3 border-2 p-3',
              request.isEscalated
                ? 'animate-pulse-attention border-status-cancelled'
                : 'border-line',
            )}
          >
            <span aria-hidden className="text-2xl">
              {SERVICE_REQUEST_ICON[request.type]}
            </span>

            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                <Link href={`/waiter/${request.tableId}`} className="hover:underline">
                  {request.tableCode}
                </Link>
                <span className="text-ink-muted ml-2 font-normal">
                  {SERVICE_REQUEST_LABEL[request.type]}
                </span>
              </p>
              <p
                className={cn(
                  'text-sm tabular-nums',
                  request.isEscalated
                    ? 'text-status-cancelled-ink font-semibold'
                    : 'text-ink-muted',
                )}
              >
                waiting {formatElapsed(request.waitingMinutes)}
                {/* Repeat taps bump one request rather than adding rows — the
                    count is how urgency shows without spamming the list. */}
                {request.repeatCount > 1 ? ` · asked ${request.repeatCount}×` : ''}
                {acknowledged ? ' · on the way' : ''}
              </p>
              {request.note ? <p className="text-ink-muted text-sm">“{request.note}”</p> : null}
            </div>

            <div className="flex shrink-0 gap-1.5">
              {!acknowledged ? (
                <button
                  type="button"
                  disabled={busyId === id}
                  onClick={() => onAcknowledge(id)}
                  className="min-h-touch border-line hover:bg-surface-sunken rounded-xl border px-3 text-sm font-semibold disabled:opacity-50"
                >
                  On it
                </button>
              ) : null}
              <button
                type="button"
                disabled={busyId === id}
                onClick={() => onResolve(id)}
                className="min-h-touch bg-status-ready rounded-xl px-3 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
              >
                Done
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
