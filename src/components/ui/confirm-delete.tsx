'use client';

import { useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { apiErrorMessage } from '@/store/api/base-query';

interface ConfirmDeleteProps {
  open: boolean;
  /** What is being deleted, e.g. "table M2". Goes into the title and the button. */
  subject: string;
  /** What happens next, in the café's terms — what stays and what goes. */
  children?: ReactNode;
  isLoading?: boolean;
  onCancel: () => void;
  /** Throws (an RTK `unwrap()` error) to keep the dialog open and show why. */
  onConfirm: (reason: string) => Promise<void>;
}

/**
 * The one confirm step in front of every Delete on the admin pages.
 *
 * Delete is soft on the server — history keeps the record — but there is no
 * Restore button, so this dialog is the whole of the undo story. The reason is
 * optional and lands in the audit log beside who pressed the button.
 *
 * A refusal from the server (an open session on the table, tables still in the
 * zone) is shown inside the dialog rather than as a toast, so the person reads
 * why before they close it.
 */
export function ConfirmDelete({
  open,
  subject,
  children,
  isLoading,
  onCancel,
  onConfirm,
}: ConfirmDeleteProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  // A fast double-tap must not send the delete twice.
  const busy = useRef(false);

  function close() {
    setReason('');
    setError(null);
    onCancel();
  }

  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason('');
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Delete ${subject}?`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="danger" isLoading={isLoading} onClick={() => void confirm()}>
            Delete
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {children ? <div className="text-ink-muted text-sm">{children}</div> : null}
        <p className="text-sm font-semibold">This cannot be undone from this screen.</p>
        <TextField
          label="Reason (optional)"
          maxLength={200}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {error ? (
          <p role="alert" className="text-status-cancelled-ink text-sm">
            {apiErrorMessage(error, `Could not delete ${subject}`)}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
