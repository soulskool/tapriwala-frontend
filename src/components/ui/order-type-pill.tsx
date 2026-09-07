'use client';

import { IconDining, IconParcel } from '@/components/ui/icons';
import { ORDER_TYPE, ORDER_TYPE_LABEL, ORDER_TYPE_VALUES, type OrderType } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * Dining or parcel, as a badge and as a chooser.
 *
 * Both render an icon *and* the word, never a colour alone — the same rule
 * `StatusPill` follows, and for the same reason: a colour-blind waiter has to
 * read the floor as fast as anyone else, and getting this one wrong sends food
 * to a table that has already left with its bag.
 */

const STYLE: Record<OrderType, string> = {
  [ORDER_TYPE.DINING]: 'bg-surface-sunken text-ink-muted border-line',
  // Parcel is the exception, so it is the one that gets the loud treatment.
  // Dining is the default and does not need to shout on every card.
  [ORDER_TYPE.PARCEL]: 'bg-status-preparing-soft text-status-preparing-ink border-status-preparing',
};

const ICON: Record<OrderType, typeof IconDining> = {
  [ORDER_TYPE.DINING]: IconDining,
  [ORDER_TYPE.PARCEL]: IconParcel,
};

export function OrderTypePill({
  orderType,
  size = 'md',
  className,
}: {
  orderType: OrderType;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const Icon = ICON[orderType];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-bold uppercase',
        size === 'sm' ? 'px-1.5 py-0.5 text-[0.65rem]' : 'px-2 py-0.5 text-xs',
        STYLE[orderType],
        className,
      )}
    >
      <Icon aria-hidden className={size === 'sm' ? 'size-3' : 'size-3.5'} />
      {ORDER_TYPE_LABEL[orderType]}
    </span>
  );
}

/**
 * The chooser, as a radio group rather than a checkbox or a switch.
 *
 * Two named options both visible at once: a waiter mid-service reads which one
 * is selected without having to know which way "on" means, and the choice is
 * announced properly to a screen reader.
 */
export function OrderTypeToggle({
  value,
  onChange,
  label = 'Order type',
  className,
}: {
  value: OrderType;
  onChange: (orderType: OrderType) => void;
  label?: string;
  className?: string;
}) {
  return (
    <fieldset className={cn('flex items-center gap-2', className)}>
      <legend className="sr-only">{label}</legend>
      {ORDER_TYPE_VALUES.map((type) => {
        const Icon = ICON[type];
        const active = value === type;

        return (
          <label
            key={type}
            className={cn(
              'min-h-touch flex flex-1 cursor-pointer items-center justify-center gap-1.5',
              'rounded-lg border-2 px-3 text-sm font-bold transition',
              // focus-within, because the real input is visually hidden and the
              // keyboard ring has to land on something the eye can see.
              'focus-within:ring-brand-500 focus-within:ring-2 focus-within:ring-offset-1',
              active
                ? 'border-brand-600 bg-brand-50 text-brand-800'
                : 'border-line bg-surface text-ink-muted hover:bg-surface-muted',
            )}
          >
            <input
              type="radio"
              name={`order-type-${label.replace(/\s+/g, '-')}`}
              value={type}
              checked={active}
              onChange={() => onChange(type)}
              className="sr-only"
            />
            <Icon aria-hidden className="size-4" />
            {ORDER_TYPE_LABEL[type]}
          </label>
        );
      })}
    </fieldset>
  );
}
