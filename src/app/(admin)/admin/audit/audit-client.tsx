'use client';

import {
  IconBack,
  IconBill,
  IconDining,
  IconKitchen,
  IconProducts,
  IconRequest,
  IconSearch,
  IconStaff,
  IconTables,
} from '@/components/ui/icons';
import { useState, type ComponentType } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { describeAudit, type AuditKind } from '@/lib/audit-text';
import type { AuditEntry } from '@/lib/types';
import { cn, formatClock } from '@/lib/utils';
import { useListAuditQuery } from '@/store/api/admin-api';
import { apiErrorMessage } from '@/store/api/base-query';

const ENTITY_OPTIONS = [
  { value: '', label: 'Everything' },
  { value: 'TableSession', label: 'Sessions' },
  { value: 'OrderRound', label: 'Orders' },
  { value: 'ProductMaster', label: 'Menu' },
  { value: 'TableMaster', label: 'Tables' },
  { value: 'ServiceRequest', label: 'Requests' },
  { value: 'BillingExport', label: 'Bills' },
  { value: 'User', label: 'Staff' },
];

/**
 * The audit log.
 *
 * This is the answer to "the guest says they never ordered that": every state
 * change carries the actor who caused it, including the anonymous customer at
 * a table. Nothing in this system is deleted, so the trail is complete.
 *
 * Each row reads as a sentence ("Sumanth served 2 × Masala Tea on M4"), built
 * from the stored event in `lib/audit-text.ts`. The raw before/after/context
 * snapshots are still one tap away, because a dispute is settled on those.
 */
export function AuditClient() {
  const [entityType, setEntityType] = useState('');
  const [tableCode, setTableCode] = useState('');
  const [page, setPage] = useState(1);

  const debouncedTableCode = useDebouncedValue(tableCode, 400).trim();

  const audit = useListAuditQuery({
    ...(entityType ? { entityType } : {}),
    ...(debouncedTableCode ? { tableCode: debouncedTableCode } : {}),
    page,
    limit: 50,
  });

  const entries = audit.data?.items ?? [];
  const pagination = audit.data?.pagination;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Audit trail</h1>

        <div className="flex flex-wrap gap-1.5">
          {ENTITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setEntityType(option.value);
                setPage(1);
              }}
              className={cn(
                'min-h-9 rounded-lg px-3 text-sm font-medium transition',
                entityType === option.value
                  ? 'bg-brand-600 text-white'
                  : 'border-line bg-surface text-ink-muted hover:text-ink border',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={tableCode}
          onChange={(event) => {
            setTableCode(event.target.value);
            setPage(1);
          }}
          placeholder="Table, e.g. M4"
          aria-label="Filter by table"
          className="min-h-touch border-line bg-surface w-40 rounded-xl border px-4 text-sm uppercase placeholder:normal-case"
        />
      </header>

      {audit.isLoading ? (
        <LoadingBlock label="Reading the trail…" />
      ) : audit.isError ? (
        <ErrorState
          message={apiErrorMessage(audit.error, 'Could not load the audit log')}
          onRetry={() => void audit.refetch()}
        />
      ) : entries.length === 0 ? (
        <EmptyState icon={<IconSearch />} title="Nothing recorded for that filter" />
      ) : (
        <>
          <ol className="flex flex-col gap-1.5">
            {entries.map((entry, index) => {
              const day = dayLabel(entry.timestamp);
              const newDay = index === 0 || dayLabel(entries[index - 1]!.timestamp) !== day;
              return (
                <li key={entry._id} className="flex flex-col gap-1.5">
                  {newDay ? (
                    <h2 className="text-ink-muted mt-2 text-xs font-semibold tracking-wide uppercase first:mt-0">
                      {day}
                    </h2>
                  ) : null}
                  <AuditRow entry={entry} />
                </li>
              );
            })}
          </ol>

          {pagination && pagination.totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                disabled={!pagination.hasPrevPage}
                onClick={() => setPage((current) => current - 1)}
              >
                <IconBack aria-hidden className="mr-1 inline size-4" /> Newer
              </Button>
              <span className="text-ink-muted text-sm tabular-nums">
                {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((current) => current + 1)}
              >
                Older →
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

const KIND_STYLE: Record<AuditKind, { icon: ComponentType<{ className?: string }>; tone: string }> =
  {
    Table: { icon: IconTables, tone: 'bg-status-occupied-soft text-status-occupied-ink' },
    Order: { icon: IconDining, tone: 'bg-status-pending-soft text-status-pending-ink' },
    Kitchen: { icon: IconKitchen, tone: 'bg-status-preparing-soft text-status-preparing-ink' },
    Request: { icon: IconRequest, tone: 'bg-status-bill-soft text-status-bill-ink' },
    Bill: { icon: IconBill, tone: 'bg-status-ready-soft text-status-ready-ink' },
    Menu: { icon: IconProducts, tone: 'bg-surface-sunken text-ink' },
    Staff: { icon: IconStaff, tone: 'bg-surface-sunken text-ink' },
  };

/** "Today", "Yesterday", or "Thu, 8 Oct" — the heading above each day's rows. */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Undated';
  const key = (value: Date) => value.toDateString();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (key(date) === key(today)) return 'Today';
  if (key(date) === key(yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const { kind, text } = describeAudit(entry);
  const { icon: Icon, tone } = KIND_STYLE[kind];

  return (
    <div className="rounded-card border-line bg-surface border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left"
      >
        <span
          className={cn(
            'mt-0.5 inline-flex w-20 shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold',
            tone,
          )}
        >
          <Icon aria-hidden className="size-3.5" />
          {kind}
        </span>

        <span className="min-w-0 flex-1 text-sm">{text}</span>

        <span className="text-ink-muted shrink-0 text-sm tabular-nums">
          {formatClock(entry.timestamp)}
        </span>
        <span aria-hidden className="text-ink-muted">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open ? (
        <div className="border-line flex flex-col gap-3 border-t px-3.5 py-3">
          <p className="text-ink-muted font-mono text-xs">
            {entry.action} · {entry.actor.name || '—'} ({entry.actor.role})
            {entry.sessionId ? ` · session ${entry.sessionId}` : ''}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {entry.before ? <Snapshot label="Before" value={entry.before} /> : null}
            {entry.after ? <Snapshot label="After" value={entry.after} /> : null}
            {entry.meta && Object.keys(entry.meta).length > 0 ? (
              <Snapshot label="Context" value={entry.meta} />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Snapshot({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <div>
      <p className="text-ink-muted mb-1 text-xs font-semibold tracking-wide uppercase">{label}</p>
      <pre className="bg-surface-muted overflow-x-auto rounded-lg p-2.5 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
