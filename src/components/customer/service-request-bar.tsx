'use client';

import { SERVICE_REQUEST_TYPE, type ServiceRequestType } from '@/lib/constants';
import { SERVICE_REQUEST_ICON, cn } from '@/lib/utils';

interface ServiceRequestBarProps {
  onRequest: (type: ServiceRequestType) => void;
  pending: ServiceRequestType | null;
  /** Asking for the bill needs a running order; the button says so if not. */
  canRequestBill: boolean;
}

const ACTIONS: { type: ServiceRequestType; label: string; hint: string }[] = [
  { type: SERVICE_REQUEST_TYPE.WATER, label: 'Water', hint: 'Ask for water' },
  { type: SERVICE_REQUEST_TYPE.CALL_STAFF, label: 'Call staff', hint: 'Someone will come over' },
  { type: SERVICE_REQUEST_TYPE.BILL, label: 'Bill', hint: 'Ask for the bill' },
];

/**
 * The three taps that fix the veranda problem.
 *
 * A guest out of eyeshot raises one of these and it lands on the waiter
 * dashboard immediately, with a wait time that keeps climbing until someone
 * deals with it. Repeat taps bump the same request rather than spamming the
 * list, so pressing twice is safe.
 */
export function ServiceRequestBar({ onRequest, pending, canRequestBill }: ServiceRequestBarProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ACTIONS.map((action) => {
        const disabled =
          pending !== null || (action.type === SERVICE_REQUEST_TYPE.BILL && !canRequestBill);

        return (
          <button
            key={action.type}
            type="button"
            disabled={disabled}
            onClick={() => onRequest(action.type)}
            title={
              action.type === SERVICE_REQUEST_TYPE.BILL && !canRequestBill
                ? 'Place an order first'
                : action.hint
            }
            className={cn(
              'rounded-card bg-surface flex min-h-20 flex-col items-center justify-center gap-1 border-2',
              'text-sm font-semibold transition',
              disabled
                ? 'border-line text-ink-muted opacity-50'
                : 'border-brand-200 text-brand-800 hover:border-brand-400 hover:bg-brand-50 active:bg-brand-100',
            )}
          >
            <span aria-hidden className="text-2xl">
              {SERVICE_REQUEST_ICON[action.type]}
            </span>
            {pending === action.type ? 'Sending…' : action.label}
          </button>
        );
      })}
    </div>
  );
}
