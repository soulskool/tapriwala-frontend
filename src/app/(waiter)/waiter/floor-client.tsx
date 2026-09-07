'use client';

import { useMemo, useState } from 'react';

import { TableGrid } from '@/components/table/table-grid';
import { ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { ReadyToServeFeed } from '@/components/waiter/ready-to-serve-feed';
import { ServiceRequestFeed } from '@/components/waiter/service-request-feed';
import { ITEM_STATUS, SERVICE_REQUEST_STATUS } from '@/lib/constants';
import type { OrderRound } from '@/lib/types';
import { cn, formatCurrencyShort } from '@/lib/utils';
import { apiErrorMessage } from '@/store/api/base-query';
import { useUnservedReadyQuery } from '@/store/api/kitchen-api';
import { useUpdateRoundStatusMutation } from '@/store/api/session-api';
import {
  useServiceRequestQueueQuery,
  useUpdateRequestMutation,
} from '@/store/api/service-request-api';
import { useLiveGridQuery } from '@/store/api/table-api';
import { useAppDispatch } from '@/store/hooks';
import { toastPushed } from '@/store/slices/ui-slice';

type Panel = 'requests' | 'ready';

/**
 * The waiter's home screen: the floor, plus the two lists that tell them where
 * to walk next.
 *
 * All three datasets are fetched unfiltered and kept live by the socket
 * middleware — no polling, because every change that matters is broadcast.
 */
export function FloorClient() {
  const dispatch = useAppDispatch();

  const grid = useLiveGridQuery();
  const requests = useServiceRequestQueueQuery();
  const ready = useUnservedReadyQuery();

  const [updateRequest] = useUpdateRequestMutation();
  const [updateRoundStatus] = useUpdateRoundStatusMutation();

  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [busyRoundId, setBusyRoundId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('requests');

  const tiles = useMemo(() => grid.data?.tables ?? [], [grid.data]);

  const summary = useMemo(() => {
    const occupied = tiles.filter((tile) => tile.status !== 'empty');
    return {
      occupied: occupied.length,
      total: tiles.length,
      running: occupied.reduce((sum, tile) => sum + tile.runningTotal, 0),
    };
  }, [tiles]);

  const openRequests = requests.data?.requests ?? [];
  const escalatedCount = requests.data?.escalated ?? 0;
  const readyRounds = ready.data?.rounds ?? [];

  async function handleRequestUpdate(
    id: string,
    status: typeof SERVICE_REQUEST_STATUS.ACKNOWLEDGED | typeof SERVICE_REQUEST_STATUS.RESOLVED,
  ) {
    setBusyRequestId(id);
    try {
      await updateRequest({ id, status }).unwrap();
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not update that request'), 'error'));
    } finally {
      setBusyRequestId(null);
    }
  }

  /** Marks every ready item on a ticket as served in one tap. */
  async function handleServe(round: OrderRound) {
    setBusyRoundId(round._id);
    try {
      await updateRoundStatus({
        roundId: round._id,
        status: ITEM_STATUS.SERVED,
        sessionId: round.sessionId,
      }).unwrap();
      dispatch(toastPushed(`${round.tableCode} served`, 'success'));
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not mark that served'), 'error'));
    } finally {
      setBusyRoundId(null);
    }
  }

  if (grid.isLoading) return <LoadingBlock label="Loading the floor…" />;
  if (grid.isError) {
    return (
      <ErrorState
        message={apiErrorMessage(grid.error, 'Could not load the floor')}
        onRetry={() => void grid.refetch()}
      />
    );
  }

  // `grid-cols-1` is deliberate: without a mobile template the implicit `auto`
  // track sizes to its content's max-content and inflates the whole page
  // sideways. `repeat(1, minmax(0,1fr))` gives the track a zero floor.
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Stat label="Tables in use" value={`${summary.occupied}/${summary.total}`} />
          <Stat label="Running total" value={formatCurrencyShort(summary.running)} />
          <Stat
            label="Waiting on staff"
            value={String(openRequests.length)}
            tone={escalatedCount > 0 ? 'alert' : 'normal'}
          />
        </div>

        <TableGrid tiles={tiles} />
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-16 lg:self-start">
        <div role="tablist" className="bg-surface-sunken grid grid-cols-2 gap-1 rounded-xl p-1">
          <PanelTab
            active={panel === 'requests'}
            onClick={() => setPanel('requests')}
            label="Requests"
            count={openRequests.length}
            alert={escalatedCount > 0}
          />
          <PanelTab
            active={panel === 'ready'}
            onClick={() => setPanel('ready')}
            label="To serve"
            count={readyRounds.length}
          />
        </div>

        {panel === 'requests' ? (
          <ServiceRequestFeed
            requests={openRequests}
            busyId={busyRequestId}
            onAcknowledge={(id) =>
              void handleRequestUpdate(id, SERVICE_REQUEST_STATUS.ACKNOWLEDGED)
            }
            onResolve={(id) => void handleRequestUpdate(id, SERVICE_REQUEST_STATUS.RESOLVED)}
          />
        ) : (
          <ReadyToServeFeed
            rounds={readyRounds}
            busyRoundId={busyRoundId}
            onServe={(round) => void handleServe(round)}
          />
        )}
      </aside>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'alert';
}) {
  return (
    <div
      className={cn(
        'rounded-card bg-surface border px-4 py-2',
        tone === 'alert' ? 'border-status-cancelled' : 'border-line',
      )}
    >
      <p className="text-ink-muted text-xs">{label}</p>
      <p
        className={cn(
          'text-lg font-bold tabular-nums',
          tone === 'alert' && 'text-status-cancelled-ink',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PanelTab({
  active,
  onClick,
  label,
  count,
  alert = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  alert?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'min-h-touch rounded-lg px-3 text-sm font-semibold transition',
        active ? 'bg-surface shadow-sm' : 'text-ink-muted hover:text-ink',
      )}
    >
      {label}
      <span
        className={cn(
          'ml-1.5 rounded-full px-1.5 text-xs tabular-nums',
          alert ? 'bg-status-cancelled text-white' : 'bg-surface-sunken text-ink-muted',
        )}
      >
        {count}
      </span>
    </button>
  );
}
