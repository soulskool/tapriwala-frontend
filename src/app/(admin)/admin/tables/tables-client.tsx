'use client';

import { IconPrint } from '@/components/ui/icons';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDelete } from '@/components/ui/confirm-delete';
import { SelectField, TextField } from '@/components/ui/field';
import { ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/modal';
import { useCanWrite } from '@/hooks/use-can-write';
import type { TableMaster } from '@/lib/types';
import { cn } from '@/lib/utils';
import { apiErrorMessage, apiFieldErrors } from '@/store/api/base-query';
import {
  useCreateTableMutation,
  useDeleteTableMutation,
  useListTablesQuery,
  useListZonesQuery,
  useQrSheetQuery,
  useUpdateTableMutation,
} from '@/store/api/table-api';
import { useAppDispatch } from '@/store/hooks';
import { toastPushed } from '@/store/slices/ui-slice';
import { ZonesManager } from './zones-manager';

type Draft = Partial<TableMaster>;

const EMPTY_DRAFT: Draft = {
  code: '',
  zoneId: '',
  displayOrder: 1,
  seatingCapacity: 4,
};

/**
 * Table Master.
 *
 * The QR sheet is the reason this screen matters day to day. Each sticker URL
 * is derived from the table's own code, so there is no "reissue" action here:
 * a damaged or missing sticker is fixed by printing the sheet again, and
 * renaming a table in this form is what changes its URL.
 *
 * Zones are managed from here too (the Zones button), and the zone dropdown
 * lists whatever zones exist now. Delete sits inside the edit dialog, behind a
 * confirm step; the server refuses it while the table has an open session.
 */
export function TablesClient() {
  const dispatch = useAppDispatch();
  const canEdit = useCanWrite();

  const tables = useListTablesQuery({ includeInactive: true });
  const qrSheet = useQrSheetQuery();
  const zones = useListZonesQuery();
  const [createTable, { isLoading: isCreating }] = useCreateTableMutation();
  const [updateTable, { isLoading: isUpdating }] = useUpdateTableMutation();
  const [deleteTable, { isLoading: isDeleting }] = useDeleteTableMutation();

  const [editing, setEditing] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<unknown>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [deleting, setDeleting] = useState<Draft | null>(null);

  const zoneOptions = (zones.data ?? []).map((zone) => ({ value: zone.id, label: zone.name }));

  async function handleSave() {
    if (!editing) return;
    setFormError(null);

    // Only the fields the form edits: `zone` is the server's read-only label.
    const body: Partial<TableMaster> = {
      code: editing.code,
      zoneId: editing.zoneId,
      displayOrder: editing.displayOrder,
      seatingCapacity: editing.seatingCapacity,
      ...(editing._id ? { isActive: editing.isActive } : {}),
    };

    try {
      if (editing._id) {
        await updateTable({ id: editing._id, body }).unwrap();
        dispatch(toastPushed('Table updated', 'success'));
      } else {
        await createTable(body).unwrap();
        dispatch(toastPushed('Table added', 'success'));
      }
      setEditing(null);
    } catch (error) {
      setFormError(error);
    }
  }

  if (tables.isLoading) return <LoadingBlock label="Loading tables…" />;
  if (tables.isError) {
    return (
      <ErrorState
        message={apiErrorMessage(tables.error, 'Could not load the tables')}
        onRetry={() => void tables.refetch()}
      />
    );
  }

  const fieldErrors = apiFieldErrors(formError);
  const rows = tables.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Tables</h1>
        <span className="text-ink-muted text-sm tabular-nums">{rows.length}</span>
        <div className="flex-1" />
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          <IconPrint aria-hidden className="mr-1.5 inline size-4" /> QR sheet
        </Button>
        {/* The QR sheet is a read, so a view-only admin keeps it. */}
        {canEdit ? (
          <>
            <Button variant="secondary" onClick={() => setZonesOpen(true)}>
              Zones
            </Button>
            <Button
              onClick={() => setEditing({ ...EMPTY_DRAFT, zoneId: zoneOptions[0]?.value ?? '' })}
            >
              + Add table
            </Button>
          </>
        ) : null}
      </header>

      <div className="rounded-card border-line bg-surface overflow-x-auto border">
        <table className="w-full min-w-[40rem] text-left">
          <thead className="border-line bg-surface-muted text-ink-muted border-b text-sm">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                Code
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Zone
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Order
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Seats
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Status
              </th>
              <th scope="col" className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((table) => (
              <tr
                key={table._id}
                className={cn('border-line border-b', !table.isActive && 'opacity-50')}
              >
                <td className="px-3 py-2.5 text-lg font-bold">{table.code}</td>
                <td className="px-3 py-2.5">{table.zone || '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{table.displayOrder}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{table.seatingCapacity}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-sm font-semibold',
                      table.isActive
                        ? 'bg-status-ready-soft text-status-ready-ink'
                        : 'bg-status-empty-soft text-status-empty-ink',
                    )}
                  >
                    {table.isActive ? 'In service' : 'Out of service'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className={cn('flex justify-end gap-1.5', !canEdit && 'hidden')}>
                    <button
                      type="button"
                      onClick={() => setEditing(table)}
                      className="border-line hover:bg-surface-sunken min-h-9 rounded-lg border px-2.5 text-sm"
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?._id ? `Edit ${editing.code}` : 'Add table'}
        footer={
          <>
            {editing?._id ? (
              <Button
                variant="ghost"
                className="text-status-cancelled-ink mr-auto"
                onClick={() => {
                  setDeleting(editing);
                  setEditing(null);
                }}
              >
                Delete table
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button isLoading={isCreating || isUpdating} onClick={() => void handleSave()}>
              Save
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Code"
              required
              hint="What staff call it, e.g. M2"
              value={editing.code ?? ''}
              onChange={(event) => setEditing({ ...editing, code: event.target.value })}
              error={fieldErrors.code}
            />
            <SelectField
              label="Zone"
              required
              hint={zoneOptions.length === 0 ? 'Add a zone first (Zones button)' : undefined}
              value={editing.zoneId ?? ''}
              onChange={(event) => setEditing({ ...editing, zoneId: event.target.value })}
              // A table whose zone is somehow gone shows a prompt instead of
              // silently pretending to be in the first zone of the list.
              options={
                zoneOptions.some((option) => option.value === editing.zoneId)
                  ? zoneOptions
                  : [{ value: '', label: 'Choose a zone…' }, ...zoneOptions]
              }
              error={fieldErrors.zoneId}
            />
            <TextField
              label="Display order"
              type="number"
              min={0}
              value={String(editing.displayOrder ?? 1)}
              onChange={(event) =>
                setEditing({ ...editing, displayOrder: Number(event.target.value) })
              }
              error={fieldErrors.displayOrder}
            />
            <TextField
              label="Seats"
              type="number"
              min={1}
              value={String(editing.seatingCapacity ?? 4)}
              onChange={(event) =>
                setEditing({ ...editing, seatingCapacity: Number(event.target.value) })
              }
              error={fieldErrors.seatingCapacity}
            />

            {editing._id ? (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={editing.isActive ?? true}
                  onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })}
                  className="size-4"
                />
                In service
                {/* The API refuses to retire a table with a live session, so a
                    guest's running order can never be stranded by this box. */}
              </label>
            ) : null}

            {formError && Object.keys(fieldErrors).length === 0 ? (
              <p role="alert" className="text-status-cancelled-ink text-sm sm:col-span-2">
                {apiErrorMessage(formError, 'Could not save that table')}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ZonesManager open={zonesOpen} onClose={() => setZonesOpen(false)} />

      <ConfirmDelete
        open={deleting !== null}
        subject={`table ${deleting?.code ?? ''}`}
        isLoading={isDeleting}
        onCancel={() => setDeleting(null)}
        onConfirm={async (reason) => {
          if (!deleting?._id) return;
          await deleteTable({ id: deleting._id, reason }).unwrap();
          dispatch(toastPushed(`Table ${deleting.code ?? ''} deleted`, 'success'));
          setDeleting(null);
        }}
      >
        It leaves the floor and the QR sheet, and its sticker stops taking orders. Past sessions and
        bills on it stay in history. The code {deleting?.code} can be used again for a new table. A
        table with an open session cannot be deleted — bill it or free it first.
      </ConfirmDelete>

      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="QR sheet"
        description="One URL per table, built from its code. Print these onto the table stickers. Reprinting is the whole recovery story if one is damaged."
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
        }
      >
        <ul className="print-sheet grid gap-2 sm:grid-cols-2">
          {(qrSheet.data ?? []).map((entry) => (
            <li key={entry.code} className="border-line rounded-lg border p-3">
              <p className="text-lg font-bold">
                {entry.code}{' '}
                <span className="text-ink-muted text-sm font-normal">{entry.zone}</span>
              </p>
              <p className="text-ink-muted mt-1 font-mono text-xs break-all">{entry.qrUrl}</p>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
