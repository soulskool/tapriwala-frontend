'use client';

import Image from 'next/image';
import { memo } from 'react';

import { QtyStepper } from '@/components/ui/qty-stepper';
import type { MenuItem } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';

interface MenuItemCardProps {
  item: MenuItem;
  /** How many of this item are already in the cart, across all lines. */
  quantity: number;
  onAdd: (item: MenuItem) => void;
  onSetQuantity: (item: MenuItem, quantity: number) => void;
  /** Staff see 86'd items greyed out; guests never see them at all. */
  showUnavailable?: boolean;
}

function MenuItemCardComponent({
  item,
  quantity,
  onAdd,
  onSetQuantity,
  showUnavailable = false,
}: MenuItemCardProps) {
  const unavailable = showUnavailable && !item.isAvailable;

  return (
    <li
      className={cn(
        'rounded-card border-line bg-surface flex gap-3 border p-3 transition',
        unavailable ? 'opacity-55' : 'hover:border-brand-200',
      )}
    >
      {item.imageUrl ? (
        <Image
          src={item.imageUrl}
          alt=""
          width={96}
          height={96}
          // Below the fold on a phone; native lazy loading is the default and
          // is exactly what we want on café Wi-Fi.
          className="size-20 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="bg-surface-sunken flex size-20 shrink-0 items-center justify-center rounded-xl text-2xl"
        >
          🍽
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{item.displayName}</h3>
          {item.description ? (
            <p className="text-ink-muted line-clamp-2 text-sm">{item.description}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold tabular-nums">{formatCurrency(item.price)}</span>

          {unavailable ? (
            <span className="bg-status-cancelled-soft text-status-cancelled-ink rounded-full px-2.5 py-1 text-xs font-semibold">
              Sold out
            </span>
          ) : quantity > 0 ? (
            <QtyStepper
              size="sm"
              value={quantity}
              label={item.displayName}
              onChange={(next) => onSetQuantity(item, next)}
            />
          ) : (
            <button
              type="button"
              onClick={() => onAdd(item)}
              className="bg-brand-600 hover:bg-brand-700 active:bg-brand-800 min-h-9 rounded-xl px-4 text-sm font-semibold text-white transition"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Memoised because a whole menu of these re-renders on every socket tick —
 * one item going out of stock must not repaint sixty cards.
 */
export const MenuItemCard = memo(MenuItemCardComponent);
