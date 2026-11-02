'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDelete } from '@/components/ui/confirm-delete';
import { IconAdd, IconDelete, IconTables, IconZones } from '@/components/ui/icons';
import { Modal } from '@/components/ui/modal';
import type { Zone } from '@/lib/types';
import { cn } from '@/lib/utils';
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
 * A dot per zone so the list reads at a glance. Decoration only — every row
 * also carries the zone's name — so the cycle can repeat past five zones.
 */
const ZONE_DOTS = [
  'bg-status-occupied',
  'bg-status-bill',
  'bg-status-ready',
  'bg-status-preparing',
  'bg-status-served',
  'bg-status-pending',
];

const INPUT =
  'border-line bg-surface focus-visible:border-brand-500 min-h-touch w-full rounded-lg border px-3 text-base outline-none';

/**
 * Add, rename, reorder and delete the café's zones.
 *
 * Tables hold a zone's id, so a rename here reaches every table, the floor,
 * the KDS and the guest's page in one save. A zone with tables in it cannot be
 * deleted — its Delete is disabled and says why on hover — so no table is
 * ever left without a zone.
 */
export function ZonesManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const zones = useListZonesQuery();
  const [createZone, { isLoading: isCreating }] = useCreateZoneMutation();
  const [deleteZone, { isLoading: isDeleting }] = useDeleteZoneMutation();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<unknown>(null);
  const [deleting, setDeleting] = useState<Zone | null>(null);

  const list = zones.data ?? [];
  const tableTotal = list.reduce((sum, zone) => sum + zone.tableCount, 0);

  function stopAdding() {
    setAdding(false);
    setNewName('');
    setAddError(null);
  }

  async function handleAdd() {
    if (!newName.trim() || isCreating) return;
    setAddError(null);
    try {
      const zone = await createZone({ name: newName.trim() }).unwrap();
      dispatch(toastPushed(`Zone ${zone.name} added`, 'success'));
      stopAdding();
    } catch (error) {
      setAddError(error);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        icon={<IconZones aria-hidden className="size-5" />}
        title="Manage zones"
        description="Organise tables into areas and set the order they appear on the live floor."
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setAdding(true)} disabled={adding}>
              <IconAdd aria-hidden className="size-4" /> Add zone
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="border-line bg-surface-muted divide-line grid grid-cols-2 divide-x rounded-xl border">
            <p className="flex items-center gap-2 px-4 py-3 text-sm font-semibold">
              <IconZones aria-hidden className="text-brand-700 size-4" />
              {list.length} zone{list.length === 1 ? '' : 's'}
            </p>
            <p className="flex items-center gap-2 px-4 py-3 text-sm font-semibold">
              <IconTables aria-hidden className="text-brand-700 size-4" />
              {tableTotal} table{tableTotal === 1 ? '' : 's'}
            </p>
          </div>

          {zones.isError ? (
            <p role="alert" className="text-status-cancelled-ink text-sm">
              {apiErrorMessage(zones.error, 'Could not load the zones')}
            </p>
          ) : null}

          {adding ? (
            <form
              className="border-brand-300 bg-brand-50 flex flex-col gap-2 rounded-xl border-2 border-dashed p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleAdd();
              }}
            >
              <label htmlFor="new-zone" className="text-sm font-semibold">
                New zone name
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="new-zone"
                  autoFocus
                  maxLength={40}
                  placeholder="e.g. Rooftop"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  className={cn(INPUT, 'min-w-40 flex-1')}
                />
                <Button type="submit" isLoading={isCreating} disabled={!newName.trim()}>
                  Add
                </Button>
                <Button variant="ghost" onClick={stopAdding}>
                  Cancel
                </Button>
              </div>
              {addError ? (
                <p role="alert" className="text-status-cancelled-ink text-sm">
                  {apiErrorMessage(addError, 'Could not add that zone')}
                </p>
              ) : null}
            </form>
          ) : null}

          {list.length === 0 && !zones.isLoading && !adding ? (
            <p className="text-ink-muted rounded-xl border border-dashed px-4 py-8 text-center text-sm">
              No zones yet. Add the first one to start placing tables.
            </p>
          ) : null}

          <ul className="flex flex-col gap-3">
            {list.map((zone, index) => (
              <ZoneRow
                key={zone.id}
                zone={zone}
                dot={ZONE_DOTS[index % ZONE_DOTS.length]!}
                onDelete={() => setDeleting(zone)}
              />
            ))}
          </ul>
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
function ZoneRow({ zone, dot, onDelete }: { zone: Zone; dot: string; onDelete: () => void }) {
  const dispatch = useAppDispatch();
  const [updateZone, { isLoading }] = useUpdateZoneMutation();
  const [name, setName] = useState(zone.name);
  const [order, setOrder] = useState(String(zone.displayOrder));
  const [error, setError] = useState<unknown>(null);

  const dirty = name.trim() !== zone.name || Number(order) !== zone.displayOrder;
  const inUse = zone.tableCount > 0;

  async function handleSave() {
    if (!dirty || isLoading) return;
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

  return (
    <li className="border-line bg-surface rounded-xl border p-4 shadow-sm transition hover:shadow-md">
      <p className="mb-3 flex items-center gap-2 font-semibold">
        <span aria-hidden className={cn('size-2.5 rounded-full', dot)} />
        {zone.name}
      </p>

      <div className="grid grid-cols-[1fr_5.5rem] items-end gap-3 sm:grid-cols-[1fr_5.5rem_auto_auto_auto]">
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted text-xs font-medium">Name</span>
          <input
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted text-xs font-medium">Order</span>
          <input
            type="number"
            min={0}
            value={order}
            onChange={(event) => setOrder(event.target.value)}
            className={cn(INPUT, 'tabular-nums')}
          />
        </label>

        <span className="bg-surface-muted text-ink-muted min-h-touch col-span-2 flex items-center justify-center rounded-lg px-3 text-sm font-medium tabular-nums sm:col-span-1">
          {zone.tableCount} table{zone.tableCount === 1 ? '' : 's'}
        </span>

        <Button
          variant="secondary"
          isLoading={isLoading}
          disabled={!dirty || !name.trim()}
          onClick={() => void handleSave()}
        >
          Save
        </Button>

        <Button
          variant="ghost"
          disabled={inUse}
          onClick={onDelete}
          title={inUse ? 'Move its tables to another zone before deleting' : undefined}
          className="border-status-cancelled/40 text-status-cancelled-ink hover:bg-status-cancelled-soft border"
        >
          <IconDelete aria-hidden className="size-4" /> Delete
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-status-cancelled-ink mt-2 text-sm">
          {apiErrorMessage(error, 'Could not save that zone')}
        </p>
      ) : null}
    </li>
  );
}
