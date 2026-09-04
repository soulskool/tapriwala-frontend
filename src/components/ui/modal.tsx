'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
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
  children,
  footer,
  size = 'md',
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
      // The backdrop is part of the dialog's box, so a click lands on the
      // element itself only when it missed the panel inside.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-labelledby="modal-title"
      className={cn(
        'rounded-card bg-surface text-ink m-auto w-[calc(100vw-2rem)] p-0 shadow-2xl backdrop:bg-black/40',
        size === 'sm' && 'max-w-sm',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-3xl',
      )}
    >
      <div className="border-line flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 id="modal-title" className="text-lg font-semibold">
            {title}
          </h2>
          {description ? <p className="text-ink-muted mt-1 text-sm">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-ink-muted hover:bg-surface-sunken -mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg"
        >
          ✕
        </button>
      </div>

      {children ? <div className="px-5 py-4">{children}</div> : null}

      {footer ? (
        <div className="border-line bg-surface-muted flex flex-wrap justify-end gap-2 border-t px-5 py-3">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
