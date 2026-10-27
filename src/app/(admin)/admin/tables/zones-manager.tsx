'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDelete } from '@/components/ui/confirm-delete';
import { TextField } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import type { Zone } from '@/lib/types';
import { apiErrorMessage } from '@/store/api/base-query';
import {
  useCreateZoneMutation,
  useDeleteZoneMutation,
  useListZonesQuery,
  useUpdateZoneMutation,
} from '@/store/api/table-api';
import { useAppDispatch } from '@/store/hooks';
import { toastPushed } from '@/store/slices/ui-slice';

/**
 * Add, rename, reorder and delete the café's zones.
 *
 * Tables hold a zone's id, so a rename here reaches every table, the floor,
 * the KDS and the guest's page in one save. A zone with tables in it cannot be
 * deleted — the button says why instead of failing — so no table is ever left
 * without a zone.
 */
export function ZonesManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const zones = useListZonesQuery();
  const [createZone, { isLoading: isCreating }] = useCreateZoneMutation();
  const [deleteZone, { isLoading: isDeleting }] = useDeleteZoneMutation();

  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<unknown>(null);
  const [deleting, setDeleting] = useState<Zone | null>(null);

  async function handleAdd() {
    setAddError(null);
    try {
      const zone = await createZone({ name: newName.trim() }).unwrap();
      dispatch(toastPushed(`Zone ${zone.name} added`, 'success'));
      setNewName('');
    } catch (error) {
      setAddError(error);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Zones"
        description="The areas the floor is drawn in. Order is left to right on the live floor."
        footer={
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {zones.isError ? (
            <p role="alert" className="text-status-cancelled-ink text-sm">
              {apiErrorMessage(zones.error, 'Could not load the zones')}
            </p>
          ) : null}

          <ul className="flex flex-col gap-2">
            {(zones.data ?? []).map((zone) => (
              <ZoneRow key={zone.id} zone={zone} onDelete={() => setDeleting(zone)} />
            ))}
          </ul>

          <form
            className="border-line flex items-end gap-2 border-t pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (newName.trim()) void handleAdd();
            }}
          >
            <div className="flex-1">
              <TextField
                label="New zone"
                placeholder="e.g. Rooftop"
                maxLength={40}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                error={addError ? apiErrorMessage(addError, 'Could not add that zone') : undefined}
              />
            </div>
            <Button type="submit" isLoading={isCreating} disabled={!newName.trim()}>
              Add
            </Button>
          </form>
        </div>
      </Modal>

      <ConfirmDelete
        open={deleting !== null}
        subject={`zone ${deleting?.name ?? ''}`}
        isLoading={isDeleting}
        onCancel={() => setDeleting(null)}
        onConfirm={async (reason) => {
          if (!deleting) return;
          await deleteZone({ id: deleting.id, reason }).unwrap();
          dispatch(toastPushed(`Zone ${deleting.name} deleted`, 'success'));
          setDeleting(null);
        }}
      >
        It disappears from the zone list. Tables deleted earlier keep showing their old zone in
        history.
      </ConfirmDelete>
    </>
  );
}

/** One zone: rename and reorder in place, delete when it is empty. */
function ZoneRow({ zone, onDelete }: { zone: Zone; onDelete: () => void }) {
  const dispatch = useAppDispatch();
  const [updateZone, { isLoading }] = useUpdateZoneMutation();
  const [name, setName] = useState(zone.name);
  const [order, setOrder] = useState(String(zone.displayOrder));
  const [error, setError] = useState<unknown>(null);

  const dirty = name.trim() !== zone.name || Number(order) !== zone.displayOrder;

  async function handleSave() {
    setError(null);
    try {
      await updateZone({
        id: zone.id,
        body: { name: name.trim(), displayOrder: Number(order) },
      }).unwrap();
      dispatch(toastPushed(`Zone ${name.trim()} saved`, 'success'));
    } catch (caught) {
      setError(caught);
    }
  }

  const inUse = zone.tableCount > 0;

  return (
    <li className="border-line rounded-lg border p-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-32 flex-1">
          <TextField
            label="Name"
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="w-20">
          <TextField
            label="Order"
            type="number"
            min={0}
            value={order}
            onChange={(event) => setOrder(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          isLoading={isLoading}
          disabled={!dirty || !name.trim()}
          onClick={() => void handleSave()}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={inUse}
          onClick={onDelete}
          title={inUse ? 'Move its tables to another zone first' : undefined}
        >
          Delete
        </Button>
      </div>
      <p className="text-ink-muted mt-1.5 text-xs">
        {inUse
          ? `${zone.tableCount} table${zone.tableCount === 1 ? '' : 's'} — move them to another zone before deleting`
          : 'No tables'}
      </p>
      {error ? (
        <p role="alert" className="text-status-cancelled-ink mt-1 text-sm">
          {apiErrorMessage(error, 'Could not save that zone')}
        </p>
      ) : null}
    </li>
  );
}
