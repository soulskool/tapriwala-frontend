'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { PrintNoticeHost } from '@/components/printer/print-notice-host';
import { IconClose } from '@/components/ui/icons';
import { ToastHost } from '@/components/ui/toast-host';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Shown in a tinted tile beside the title. */
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /**
   * False while something is in flight that must not be walked away from —
   * a payment half-recorded, a bill half-made. Escape, the backdrop and the
   * close button then do nothing, so the outcome is always seen.
   */
  dismissible?: boolean;
}

/**
 * A dialog built on `<dialog>`.
 *
 * The native element gives focus trapping, Escape-to-close and inertness of the
 * page behind it for free — all of which a hand-rolled div would have to
 * reimplement, usually badly.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
      // The backdrop is part of the dialog's box, so a click lands on the
      // element itself only when it missed the panel inside.
      onClick={(event) => {
        if (event.target === dialogRef.current && dismissible) onClose();
      }}
      aria-labelledby="modal-title"
      className={cn(
        // The dialog itself never scrolls: header and footer stay put and only
        // the body scrolls, inside the rounded box. A scrolling dialog put the
        // browser's scrollbar on its rounded edge and squared the corner off.
        'rounded-card bg-surface text-ink m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 shadow-2xl backdrop:bg-black/40 open:flex',
        size === 'sm' && 'max-w-sm',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-3xl',
      )}
    >
      <div className="border-line flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
        {icon ? (
          <span className="bg-brand-50 text-brand-700 flex size-10 shrink-0 items-center justify-center rounded-xl">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 id="modal-title" className="text-lg font-semibold">
            {title}
          </h2>
          {description ? <p className="text-ink-muted mt-1 text-sm">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={!dismissible}
          aria-label="Close"
          className="text-ink-muted hover:bg-surface-sunken -mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg"
        >
          <IconClose aria-hidden className="size-4" />
        </button>
      </div>

      {children ? (
        <div className="modal-body thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      ) : null}

      {footer ? (
        <div className="border-line bg-surface-muted flex shrink-0 flex-wrap justify-end gap-2 border-t px-5 py-3">
          {footer}
        </div>
      ) : null}

      {/*
       * Toasts and printer notices, again, inside the dialog. An open modal
       * sits in the browser's top layer above the page's own copies, so
       * "Did not print — use the system dialog" or a refused close raised
       * while it is open landed behind it where nobody could read or tap
       * it. Rendered only while open; the page's copies hide meanwhile.
       */}
      {open ? (
        <>
          <ToastHost inDialog />
          <PrintNoticeHost inDialog />
        </>
      ) : null}
    </dialog>
  );
}
