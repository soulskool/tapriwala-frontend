'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { IconCheck, IconClose, IconPrint, IconWarning } from '@/components/ui/icons';
import { usePrintNotice } from '@/hooks/use-printer';
import { dismissPrintNotice } from '@/lib/print/print-document';
import { cn } from '@/lib/utils';

/**
 * "Printing…", "Sent", or "Did not print — here is the other way".
 *
 * The failure stays until it is acted on, like an error toast, and always
 * offers the browser's own print dialog: a direct-print failure must never
 * leave the counter holding a guest's bill with no way to print it.
 *
 * Cleared on navigation, because its fallback prints the screen it was raised
 * on — from any other screen it would print the wrong page.
 */
export function PrintNoticeHost() {
  const notice = usePrintNotice();
  const pathname = usePathname();

  useEffect(() => {
    dismissPrintNotice();
  }, [pathname]);

  if (!notice) return null;

  const failed = notice.tone === 'failed';
  const Icon = failed ? IconWarning : notice.tone === 'sent' ? IconCheck : IconPrint;

  return (
    <div className="print-hidden pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4">
      <div
        role={failed ? 'alert' : 'status'}
        className={cn(
          'animate-rise pointer-events-auto flex w-full max-w-md flex-col gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
          failed
            ? 'bg-status-cancelled text-white'
            : notice.tone === 'sent'
              ? 'bg-status-ready text-white'
              : 'bg-ink text-white',
        )}
      >
        <div className="flex items-start gap-2.5">
          <Icon
            aria-hidden
            className={cn('mt-0.5 size-4 shrink-0', notice.tone === 'sending' && 'animate-pulse')}
          />
          <p className="flex-1">
            {failed ? <span className="font-bold">Did not print. </span> : null}
            {notice.message}
          </p>
          <button
            type="button"
            onClick={dismissPrintNotice}
            aria-label="Dismiss"
            className="-m-1 rounded p-1 opacity-80 hover:opacity-100"
          >
            <IconClose aria-hidden className="size-4" />
          </button>
        </div>
        {failed ? (
          <Button variant="secondary" fullWidth onClick={notice.fallback}>
            <IconPrint aria-hidden className="mr-1.5 inline size-4" /> Print with system dialog
            instead
          </Button>
        ) : null}
      </div>
    </div>
  );
}
