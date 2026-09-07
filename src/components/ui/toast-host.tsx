'use client';

import { useEffect } from 'react';

import { IconCheck, IconClose, IconInfo, IconWarning } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toastDismissed, type Toast } from '@/store/slices/ui-slice';

/**
 * Transient confirmations, bottom-centre so a thumb never covers them.
 *
 * This is where "order placed" versus "failed to send" is answered. A waiter
 * must never walk away from a table believing an order went through when it
 * did not, so failures are sticky — only successes time out.
 */
export function ToastHost() {
  const toasts = useAppSelector((state) => state.ui.toasts);

  return (
    <div
      aria-live="polite"
      className="print-hidden pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

const TONE_STYLE = {
  success: 'bg-status-ready text-white',
  error: 'bg-status-cancelled text-white',
  info: 'bg-ink text-white',
} as const;

const TONE_ICON = { success: IconCheck, error: IconWarning, info: IconInfo } as const;

function ToastCard({ toast }: { toast: Toast }) {
  const ToneIcon = TONE_ICON[toast.tone];
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Errors stay until dismissed — the whole point is that they are read.
    if (toast.tone === 'error') return;

    const timer = setTimeout(() => dispatch(toastDismissed(toast.id)), 3_500);
    return () => clearTimeout(timer);
  }, [dispatch, toast.id, toast.tone]);

  return (
    <button
      type="button"
      onClick={() => dispatch(toastDismissed(toast.id))}
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl px-4 py-3',
        'animate-rise text-left text-sm font-medium shadow-lg',
        TONE_STYLE[toast.tone],
      )}
    >
      <ToneIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <IconClose aria-hidden className="mt-0.5 size-4 shrink-0 opacity-70" />
    </button>
  );
}
