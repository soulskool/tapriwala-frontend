'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/modal';
import { ROLES, ROLE_VALUES, type Role } from '@/lib/constants';
import type { StaffUser } from '@/lib/types';
import { cn, formatDateTime, initials } from '@/lib/utils';
import {
  useCreateUserMutation,
  useListUsersQuery,
  useUpdateUserMutation,
} from '@/store/api/admin-api';
import { apiErrorMessage, apiFieldErrors } from '@/store/api/base-query';
import { useAppDispatch } from '@/store/hooks';
import { toastPushed } from '@/store/slices/ui-slice';

interface Draft {
  id?: string;
  name: string;
  phone: string;
  role: Role;
  pin: string;
  isActive?: boolean;
}

const EMPTY_DRAFT: Draft = { name: '', phone: '', role: ROLES.WAITER, pin: '' };

/**
 * Staff accounts.
 *
 * Devices are shared, so an account is really "who is on this device right
 * now". Deactivating is preferred over deleting: the audit trail references
 * these users, and a name that vanishes makes an old dispute unreadable.
 */
export function UsersClient() {
  const dispatch = useAppDispatch();

  const users = useListUsersQuery({ includeInactive: true });
  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [updateUser, { isLoading: isUpdating }] = useUpdateUserMutation();

  const [editing, setEditing] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<unknown>(null);

  async function handleSave() {
    if (!editing) return;
    setFormError(null);

    try {
      if (editing.id) {
        await updateUser({
          id: editing.id,
          body: {
            name: editing.name,
            role: editing.role,
            isActive: editing.isActive ?? true,
            // Only send a PIN when one was actually typed — an empty string
            // would otherwise reset the person's PIN on every save.
            ...(editing.pin ? { pin: editing.pin } : {}),
          },
        }).unwrap();
        dispatch(toastPushed(`${editing.name} updated`, 'success'));
      } else {
        await createUser({
          name: editing.name,
          phone: editing.phone,
          role: editing.role,
          pin: editing.pin,
        }).unwrap();
        dispatch(toastPushed(`${editing.name} added`, 'success'));
      }
      setEditing(null);
    } catch (error) {
      setFormError(error);
    }
  }

  if (users.isLoading) return <LoadingBlock label="Loading staff…" />;
  if (users.isError) {
    return (
      <ErrorState
        message={apiErrorMessage(users.error, 'Could not load staff')}
        onRetry={() => void users.refetch()}
      />
    );
  }

  const fieldErrors = apiFieldErrors(formError);
  const rows = users.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Staff</h1>
        <span className="text-ink-muted text-sm tabular-nums">{rows.length}</span>
        <div className="flex-1" />
        <Button onClick={() => setEditing({ ...EMPTY_DRAFT })}>+ Add person</Button>
      </header>

      <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((user) => (
          <UserCard key={user.id} user={user} onEdit={() => setEditing(toDraft(user))} />
        ))}
      </ul>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : 'Add person'}
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
          <div className="grid gap-3">
            <TextField
              label="Name"
              required
              value={editing.name}
              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              error={fieldErrors.name}
            />
            <TextField
              label="Phone"
              type="tel"
              inputMode="numeric"
              required
              hint="Used as the sign-in id"
              disabled={Boolean(editing.id)}
              value={editing.phone}
              onChange={(event) => setEditing({ ...editing, phone: event.target.value })}
              error={fieldErrors.phone}
            />
            <SelectField
              label="Role"
              value={editing.role}
              onChange={(event) => setEditing({ ...editing, role: event.target.value as Role })}
              options={ROLE_VALUES.map((role) => ({ value: role, label: role }))}
            />
            <TextField
              label={editing.id ? 'New PIN (leave blank to keep)' : 'PIN'}
              type="password"
              inputMode="numeric"
              maxLength={4}
              required={!editing.id}
              hint="4 digits"
              value={editing.pin}
              onChange={(event) =>
                setEditing({ ...editing, pin: event.target.value.replace(/\D/g, '') })
              }
              error={fieldErrors.pin}
            />

            {editing.id ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.isActive ?? true}
                  onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })}
                  className="size-4"
                />
                Active — can sign in
              </label>
            ) : null}

            {formError && Object.keys(fieldErrors).length === 0 ? (
              <p role="alert" className="text-status-cancelled-ink text-sm">
                {apiErrorMessage(formError, 'Could not save')}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function toDraft(user: StaffUser): Draft {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    pin: '',
  };
}

const ROLE_STYLE: Record<Role, string> = {
  [ROLES.WAITER]: 'bg-status-occupied-soft text-status-occupied-ink',
  [ROLES.KITCHEN]: 'bg-status-preparing-soft text-status-preparing-ink',
  [ROLES.BILLING]: 'bg-status-bill-soft text-status-bill-ink',
  [ROLES.ADMIN]: 'bg-brand-100 text-brand-800',
};

function UserCard({ user, onEdit }: { user: StaffUser; onEdit: () => void }) {
  return (
    <li
      className={cn(
        'rounded-card border-line bg-surface flex items-center gap-3 border p-3.5',
        !user.isActive && 'opacity-55',
      )}
    >
      <span className="bg-brand-600 flex size-11 shrink-0 items-center justify-center rounded-full font-bold text-white">
        {initials(user.name)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{user.name}</p>
        <p className="text-ink-muted text-sm tabular-nums">{user.phone}</p>
        <p className="text-ink-muted text-xs">
          {user.lastLoginAt ? `last in ${formatDateTime(user.lastLoginAt)}` : 'never signed in'}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', ROLE_STYLE[user.role])}>
          {user.role}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="border-line hover:bg-surface-sunken min-h-9 rounded-lg border px-2.5 text-sm"
        >
          Edit
        </button>
      </div>
    </li>
  );
}
