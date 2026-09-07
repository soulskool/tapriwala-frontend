'use client';

import { IconBack, IconSearch } from '@/components/ui/icons';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { useDebouncedValue } from '@/hooks/use-debounce';
import type { AuditEntry } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/utils';
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
 */
export function AuditClient() {
  const [entityType, setEntityType] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSessionId = useDebouncedValue(sessionId, 400);

  const audit = useListAuditQuery({
    ...(entityType ? { entityType } : {}),
    ...(debouncedSessionId.trim() ? { sessionId: debouncedSessionId.trim() } : {}),
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
          value={sessionId}
          onChange={(event) => {
            setSessionId(event.target.value);
            setPage(1);
          }}
          placeholder="Filter by session id"
          aria-label="Filter by session id"
          className="min-h-touch border-line bg-surface min-w-56 flex-1 rounded-xl border px-4 font-mono text-sm"
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
            {entries.map((entry) => (
              <AuditRow key={entry._id} entry={entry} />
            ))}
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

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(entry.before ?? entry.after ?? entry.meta);

  return (
    <li className="rounded-card border-line bg-surface border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={!hasDetail}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left disabled:cursor-default"
      >
        <span className="bg-surface-sunken rounded px-1.5 py-0.5 font-mono text-xs font-semibold">
          {entry.action}
        </span>

        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{entry.actor.name || entry.actor.role}</span>
          <span className="text-ink-muted"> · {entry.actor.role}</span>
          {entry.tableCode ? <span className="text-ink-muted"> · {entry.tableCode}</span> : null}
        </span>

        <span className="text-ink-muted shrink-0 text-sm">{formatDateTime(entry.createdAt)}</span>
        {hasDetail ? (
          <span aria-hidden className="text-ink-muted">
            {open ? '▴' : '▾'}
          </span>
        ) : null}
      </button>

      {open && hasDetail ? (
        <div className="border-line grid gap-3 border-t px-3.5 py-3 sm:grid-cols-2">
          {entry.before ? <Snapshot label="Before" value={entry.before} /> : null}
          {entry.after ? <Snapshot label="After" value={entry.after} /> : null}
          {entry.meta ? <Snapshot label="Context" value={entry.meta} /> : null}
        </div>
      ) : null}
    </li>
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
