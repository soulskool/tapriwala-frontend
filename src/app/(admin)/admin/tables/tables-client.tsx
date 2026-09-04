'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/modal';
import { TABLE_ZONES, TABLE_ZONE_VALUES } from '@/lib/constants';
import type { TableMaster } from '@/lib/types';
import { cn } from '@/lib/utils';
import { apiErrorMessage, apiFieldErrors } from '@/store/api/base-query';
import {
  useCreateTableMutation,
  useListTablesQuery,
  useQrSheetQuery,
  useUpdateTableMutation,
} from '@/store/api/table-api';
import { useAppDispatch } from '@/store/hooks';
import { toastPushed } from '@/store/slices/ui-slice';

type Draft = Partial<TableMaster>;

const EMPTY_DRAFT: Draft = {
  code: '',
  zone: TABLE_ZONES.MIDDLE,
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
 */
export function TablesClient() {
  const dispatch = useAppDispatch();

  const tables = useListTablesQuery({ includeInactive: true });
  const qrSheet = useQrSheetQuery();
  const [createTable, { isLoading: isCreating }] = useCreateTableMutation();
  const [updateTable, { isLoading: isUpdating }] = useUpdateTableMutation();

  const [editing, setEditing] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<unknown>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  async function handleSave() {
    if (!editing) return;
    setFormError(null);

    try {
      if (editing._id) {
        const { _id, ...body } = editing;
        await updateTable({ id: _id, body }).unwrap();
        dispatch(toastPushed('Table updated', 'success'));
      } else {
        await createTable(editing).unwrap();
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
          🖨 QR sheet
        </Button>
        <Button onClick={() => setEditing({ ...EMPTY_DRAFT })}>+ Add table</Button>
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
                <td className="px-3 py-2.5">{table.zone}</td>
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
                  <div className="flex justify-end gap-1.5">
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
              value={editing.zone ?? TABLE_ZONES.MIDDLE}
              onChange={(event) =>
                setEditing({ ...editing, zone: event.target.value as TableMaster['zone'] })
              }
              options={TABLE_ZONE_VALUES.map((zone) => ({ value: zone, label: zone }))}
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

      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="QR sheet"
        description="One URL per table, built from its code. Print these onto the table stickers — reprinting is the whole recovery story if one is damaged."
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
