'use client';

import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { IconBillMoved, IconWarning } from '@/components/ui/icons';
import { Modal } from '@/components/ui/modal';
import type { LiveTableTile, SessionDetail } from '@/lib/types';
import { cn, formatCurrencyShort } from '@/lib/utils';
import { apiErrorMessage } from '@/store/api/base-query';
import { useMoveBillMutation, useUndoBillMoveMutation } from '@/store/api/session-api';
import { useAppDispatch } from '@/store/hooks';
import { toastPushed } from '@/store/slices/ui-slice';

interface BillMoveProps {
  tile: LiveTableTile;
  sessionId: string;
  detail: SessionDetail | undefined;
  /** Every tile on the floor, to offer the tables that can take the bill. */
  tiles: LiveTableTile[];
  canAct: boolean;
}

/**
 * "M4 and M3 are one party — put it all on M3."
 *
 * Shows where this table's bill went (with Undo), or which tables ride on it,
 * and the button that moves it. The kitchen is untouched by any of this: M4's
 * food is still M4's food. Only the bill moves, and the printed bill is an
 * ordinary bill for the table that pays.
 */
export function BillMove({ tile, sessionId, detail, tiles, canAct }: BillMoveProps) {
  const dispatch = useAppDispatch();
  const [moveBill, { isLoading: isMoving }] = useMoveBillMutation();
  const [undoBillMove, { isLoading: isUndoing }] = useUndoBillMoveMutation();

  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  // Set synchronously on the first tap, before any re-render can disable the
  // button, so a fast double-tap can never send the same move twice.
  const busy = useRef(false);

  const movedTo = detail?.billMovedTo ?? null;
  const riders = (detail?.billIncludes ?? []).filter((rider) => rider.isActive);

  // Tables with an open order, other than this one and the ones already riding
  // on its bill (moving onto those would be a loop the server refuses anyway).
  const targets = tiles.filter(
    (candidate) =>
      candidate.sessionId &&
      candidate.tableId !== tile.tableId &&
      !tile.billIncludes.includes(candidate.code),
  );

  function close() {
    setOpen(false);
    setTargetId(null);
    setReason('');
    setError(null);
  }

  async function handleMove() {
    const target = targets.find((candidate) => candidate.tableId === targetId);
    if (!target || busy.current) return;
    busy.current = true;
    setError(null);
    try {
      await moveBill({ sessionId, toTableId: target.tableId, reason: reason.trim() }).unwrap();
      dispatch(
        toastPushed(
          `${tile.code}'s bill moved to ${target.billWithTableCode ?? target.code}`,
          'success',
        ),
      );
      close();
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
    }
  }

  async function handleUndo() {
    if (busy.current) return;
    busy.current = true;
    try {
      await undoBillMove({ sessionId }).unwrap();
      dispatch(toastPushed(`${tile.code} has its own bill again`, 'success'));
    } catch (caught) {
      dispatch(toastPushed(apiErrorMessage(caught, 'Could not undo the move'), 'error'));
    } finally {
      busy.current = false;
    }
  }

  return (
    <>
      {movedTo ? (
        <div className="rounded-card border-status-bill/40 bg-status-bill-soft text-status-bill-ink flex flex-wrap items-center gap-2 border px-4 py-2.5 text-sm">
          <IconBillMoved aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">
            <strong>Bill moved to {movedTo.tableCode}.</strong> Keep serving {tile.code} as usual;{' '}
            {movedTo.tableCode} pays for both.
          </span>
          {canAct ? (
            <Button
              size="sm"
              variant="secondary"
              isLoading={isUndoing}
              onClick={() => void handleUndo()}
            >
              Undo move
            </Button>
          ) : null}
        </div>
      ) : riders.length > 0 ? (
        <p className="rounded-card border-status-bill/40 bg-status-bill-soft text-status-bill-ink flex items-center gap-2 border px-4 py-2.5 text-sm">
          <IconBillMoved aria-hidden className="size-4 shrink-0" />
          <span>
            <strong>
              This bill also covers {riders.map((rider) => rider.tableCode).join(', ')}.
            </strong>{' '}
            Closing it with a bill closes {riders.length === 1 ? 'that table' : 'those tables'} too.
          </span>
        </p>
      ) : null}

      {canAct && !movedTo ? (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <IconBillMoved aria-hidden className="size-4" /> Move bill to another table
          </Button>
        </div>
      ) : null}

      <Modal
        open={open}
        onClose={close}
        title={`Move ${tile.code}'s bill`}
        description={`Which table pays for ${tile.code}? ${tile.code}'s orders, and anything it orders later, go on that table's bill. The kitchen still serves ${tile.code}.`}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button isLoading={isMoving} disabled={!targetId} onClick={() => void handleMove()}>
              Move bill
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {targets.length === 0 ? (
            <p
              role="alert"
              className="rounded-card border-status-pending bg-status-pending-soft text-status-pending-ink flex items-start gap-2 border-2 px-4 py-3 text-base font-bold"
            >
              <IconWarning aria-hidden className="mt-0.5 size-5 shrink-0" />
              <span>
                No other table has an open order. A bill can only move to a table that has one.
              </span>
            </p>
          ) : (
            <ul
              className="grid grid-cols-3 gap-2 sm:grid-cols-4"
              aria-label="Tables with an open order"
            >
              {targets.map((candidate) => (
                <li key={candidate.tableId}>
                  <button
                    type="button"
                    aria-pressed={targetId === candidate.tableId}
                    onClick={() => setTargetId(candidate.tableId)}
                    className={cn(
                      'min-h-touch w-full rounded-lg border-2 px-2 py-2 text-left',
                      targetId === candidate.tableId
                        ? 'border-brand-600 bg-brand-50'
                        : 'border-line hover:bg-surface-sunken',
                    )}
                  >
                    <span className="block text-lg font-bold">{candidate.code}</span>
                    <span className="text-ink-muted block text-xs">
                      {candidate.billWithTableCode
                        ? `bill with ${candidate.billWithTableCode}`
                        : formatCurrencyShort(candidate.runningTotal)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <TextField
            label="Reason (optional)"
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-status-cancelled-ink text-sm">
              {apiErrorMessage(error, 'Could not move the bill')}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
