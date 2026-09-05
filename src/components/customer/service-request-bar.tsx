'use client';

import { SERVICE_REQUEST_TYPE, type ServiceRequestType } from '@/lib/constants';
import { SERVICE_REQUEST_ICON, cn, formatClock } from '@/lib/utils';

/**
 * What the guest is promised, per request type.
 *
 * Exported so the toast the page raises and the confirmation printed under the
 * buttons say the same sentence. They used to differ: every non-bill request
 * produced "Staff have been notified", which tells a guest who asked for water
 * nothing about whether water is actually coming.
 */
export const SERVICE_REQUEST_CONFIRMATION: Record<ServiceRequestType, string> = {
  [SERVICE_REQUEST_TYPE.WATER]: 'Water is on its way to your table.',
  [SERVICE_REQUEST_TYPE.CALL_STAFF]: 'A team member is coming to your table.',
  [SERVICE_REQUEST_TYPE.BILL]: 'Your bill is being prepared and will be brought over.',
};

interface ServiceRequestBarProps {
  onRequest: (type: ServiceRequestType) => void;
  pending: ServiceRequestType | null;
  /** Asking for the bill needs a running order; the button says so if not. */
  canRequestBill: boolean;
  /** Requests this phone has sent, type → when. Drives the confirmations. */
  sent: Partial<Record<ServiceRequestType, string>>;
  onDismiss: (type: ServiceRequestType) => void;
}

/** The one-line promise printed under each label. */
const ACTIONS: { type: ServiceRequestType; label: string; hint: string }[] = [
  { type: SERVICE_REQUEST_TYPE.WATER, label: 'Water', hint: 'We bring a jug over' },
  { type: SERVICE_REQUEST_TYPE.CALL_STAFF, label: 'Call staff', hint: 'Someone comes over' },
  { type: SERVICE_REQUEST_TYPE.BILL, label: 'Bill', hint: 'We bring your bill' },
];

/**
 * The three taps that fix the veranda problem.
 *
 * A guest out of eyeshot raises one of these and it lands on the waiter
 * dashboard immediately, with a wait time that keeps climbing until someone
 * deals with it. Repeat taps bump the same request rather than spamming the
 * list, so pressing twice is safe — which is why an already-sent button stays
 * live and says "tap to remind" instead of going dead.
 *
 * Everything here is sized for one thumb on a phone in low light: the whole
 * card is the tap target, and the explanation of what each button does is
 * printed on screen rather than hidden in a `title` a touchscreen never shows.
 */
export function ServiceRequestBar({
  onRequest,
  pending,
  canRequestBill,
  sent,
  onDismiss,
}: ServiceRequestBarProps) {
  const confirmed = ACTIONS.filter((action) => sent[action.type]);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {ACTIONS.map((action) => {
          const billBlocked = action.type === SERVICE_REQUEST_TYPE.BILL && !canRequestBill;
          const disabled = pending !== null || billBlocked;
          const alreadySent = Boolean(sent[action.type]);

          const hint = billBlocked
            ? 'Order something first'
            : alreadySent
              ? 'Asked · tap to remind'
              : action.hint;

          return (
            <button
              key={action.type}
              type="button"
              disabled={disabled}
              onClick={() => onRequest(action.type)}
              className={cn(
                'rounded-card bg-surface flex min-h-24 flex-col items-center justify-center gap-1',
                'border-2 px-1 py-2 text-center transition',
                disabled
                  ? 'border-line text-ink-muted opacity-50'
                  : alreadySent
                    ? 'border-status-ready/50 text-status-ready-ink hover:bg-status-ready-soft'
                    : 'border-brand-200 text-brand-800 hover:border-brand-400 hover:bg-brand-50 active:bg-brand-100',
              )}
            >
              <span aria-hidden className="text-2xl leading-none">
                {SERVICE_REQUEST_ICON[action.type]}
              </span>
              <span className="text-sm leading-tight font-semibold">
                {pending === action.type ? 'Sending…' : action.label}
              </span>
              {/*
               * 11px, two lines at most, and it wraps rather than truncating —
               * at 360px wide each of these cards is about 100px across, and a
               * clipped promise is worse than none.
               */}
              <span className="text-[11px] leading-tight font-normal opacity-75">{hint}</span>
            </button>
          );
        })}
      </div>

      {/*
       * The confirmation stays on screen instead of riding away with a toast.
       * A guest who looks up ten seconds later should still be able to see that
       * the tap worked, and at what time — otherwise they tap again, and again.
       */}
      {confirmed.length > 0 ? (
        <ul aria-live="polite" className="flex flex-col gap-2">
          {confirmed.map((action) => (
            <li
              key={action.type}
              className={cn(
                'rounded-card border-status-ready/40 bg-status-ready-soft text-status-ready-ink',
                'animate-rise flex items-start gap-2 border px-3 py-2.5',
              )}
            >
              <span aria-hidden className="text-base leading-5">
                ✓
              </span>
              <p className="flex-1 text-sm leading-snug">
                {SERVICE_REQUEST_CONFIRMATION[action.type]}{' '}
                <span className="opacity-75">Asked at {formatClock(sent[action.type])}.</span>
              </p>
              <button
                type="button"
                onClick={() => onDismiss(action.type)}
                aria-label={`Dismiss the ${action.label.toLowerCase()} confirmation`}
                className="-my-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-sm opacity-60"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
