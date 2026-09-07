import { memo } from 'react';

import {
  IconBill,
  IconStatusAccepted,
  IconStatusCancelled,
  IconStatusEmpty,
  IconStatusOccupied,
  IconStatusPending,
  IconStatusPreparing,
  IconStatusReady,
  IconStatusServed,
  type IconType,
} from '@/components/ui/icons';
import {
  ITEM_STATUS,
  SESSION_STATUS,
  TILE_EMPTY,
  type ItemStatus,
  type TileStatus,
} from '@/lib/constants';
import { ITEM_STATUS_LABEL, TILE_STATUS_LABEL, cn } from '@/lib/utils';

/**
 * The status vocabulary, in one place.
 *
 * §5 of the plan requires colour **plus** an icon and a label: a colour-blind
 * waiter has to read the floor as fast as anyone else, so no status is ever
 * distinguished by hue alone. Change a colour here and every screen follows.
 */

interface StatusStyle {
  /** Fill + text + border classes, all from the design tokens. */
  className: string;
  /** The component, not a rendered element — the pill decides the size. */
  icon: IconType;
  label: string;
}

export const TILE_STATUS_STYLE: Record<TileStatus, StatusStyle> = {
  [TILE_EMPTY]: {
    className: 'bg-status-empty-soft text-status-empty-ink border-status-empty/30',
    icon: IconStatusEmpty,
    label: TILE_STATUS_LABEL[TILE_EMPTY],
  },
  [SESSION_STATUS.OCCUPIED]: {
    className: 'bg-status-occupied-soft text-status-occupied-ink border-status-occupied/30',
    icon: IconStatusOccupied,
    label: TILE_STATUS_LABEL[SESSION_STATUS.OCCUPIED],
  },
  [SESSION_STATUS.ORDER_PENDING]: {
    className: 'bg-status-pending-soft text-status-pending-ink border-status-pending/40',
    icon: IconStatusPending,
    label: TILE_STATUS_LABEL[SESSION_STATUS.ORDER_PENDING],
  },
  [SESSION_STATUS.PREPARING]: {
    className: 'bg-status-preparing-soft text-status-preparing-ink border-status-preparing/40',
    icon: IconStatusPreparing,
    label: TILE_STATUS_LABEL[SESSION_STATUS.PREPARING],
  },
  [SESSION_STATUS.READY]: {
    className: 'bg-status-ready-soft text-status-ready-ink border-status-ready/40',
    icon: IconStatusReady,
    label: TILE_STATUS_LABEL[SESSION_STATUS.READY],
  },
  [SESSION_STATUS.BILL_REQUESTED]: {
    className: 'bg-status-bill-soft text-status-bill-ink border-status-bill/40',
    icon: IconBill,
    label: TILE_STATUS_LABEL[SESSION_STATUS.BILL_REQUESTED],
  },
  [SESSION_STATUS.CLOSED]: {
    className: 'bg-status-empty-soft text-status-empty-ink border-status-empty/30',
    icon: IconStatusCancelled,
    label: TILE_STATUS_LABEL[SESSION_STATUS.CLOSED],
  },
};

export const ITEM_STATUS_STYLE: Record<ItemStatus, StatusStyle> = {
  [ITEM_STATUS.PENDING]: {
    className: 'bg-status-pending-soft text-status-pending-ink border-status-pending/40',
    icon: IconStatusPending,
    label: ITEM_STATUS_LABEL[ITEM_STATUS.PENDING],
  },
  [ITEM_STATUS.ACCEPTED]: {
    className: 'bg-status-occupied-soft text-status-occupied-ink border-status-occupied/40',
    icon: IconStatusAccepted,
    label: ITEM_STATUS_LABEL[ITEM_STATUS.ACCEPTED],
  },
  [ITEM_STATUS.PREPARING]: {
    className: 'bg-status-preparing-soft text-status-preparing-ink border-status-preparing/40',
    icon: IconStatusPreparing,
    label: ITEM_STATUS_LABEL[ITEM_STATUS.PREPARING],
  },
  [ITEM_STATUS.READY]: {
    className: 'bg-status-ready-soft text-status-ready-ink border-status-ready/40',
    icon: IconStatusReady,
    label: ITEM_STATUS_LABEL[ITEM_STATUS.READY],
  },
  [ITEM_STATUS.SERVED]: {
    className: 'bg-status-served-soft text-status-served-ink border-status-served/40',
    icon: IconStatusServed,
    label: ITEM_STATUS_LABEL[ITEM_STATUS.SERVED],
  },
  [ITEM_STATUS.CANCELLED]: {
    className: 'bg-status-cancelled-soft text-status-cancelled-ink border-status-cancelled/40',
    icon: IconStatusCancelled,
    label: ITEM_STATUS_LABEL[ITEM_STATUS.CANCELLED],
  },
};

interface StatusPillProps {
  status: TileStatus | ItemStatus;
  kind?: 'tile' | 'item';
  size?: 'sm' | 'md';
  className?: string;
}

function StatusPillComponent({ status, kind = 'item', size = 'sm', className }: StatusPillProps) {
  const style =
    kind === 'tile'
      ? TILE_STATUS_STYLE[status as TileStatus]
      : ITEM_STATUS_STYLE[status as ItemStatus];

  if (!style) return null;

  const Icon = style.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        style.className,
        className,
      )}
    >
      <Icon aria-hidden className="shrink-0" />
      {style.label}
    </span>
  );
}

/** Memoised: these repaint on every socket tick across a whole board. */
export const StatusPill = memo(StatusPillComponent);
