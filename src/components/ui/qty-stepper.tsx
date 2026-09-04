'use client';

import { memo } from 'react';

import { CART_LIMITS } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface QtyStepperProps {
  value: number;
  onChange: (next: number) => void;
  /** Stepping below this removes the line, so the minus button reads "remove". */
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  label?: string;
  disabled?: boolean;
}

/**
 * The +/− control on every cart line and menu card.
 *
 * Buttons rather than a number input: on Android Chrome a numeric keypad
 * covering half the menu to change "2" to "3" is the wrong trade, and taps are
 * faster than typing when a waiter is standing at a table.
 */
function QtyStepperComponent({
  value,
  onChange,
  min = 0,
  max = CART_LIMITS.MAX_QUANTITY_PER_ITEM,
  size = 'md',
  label = 'Quantity',
  disabled = false,
}: QtyStepperProps) {
  const buttonSize = size === 'sm' ? 'size-9 text-lg' : 'size-11 text-xl';
  const removes = value <= min + 1 && min === 0;

  return (
    <div
      className={cn(
        'border-line bg-surface inline-flex items-center rounded-xl border',
        disabled && 'opacity-50',
      )}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        aria-label={removes ? `Remove ${label}` : `Decrease ${label}`}
        className={cn(
          buttonSize,
          'flex items-center justify-center rounded-l-xl font-semibold transition',
          'text-ink-muted hover:bg-surface-sunken active:bg-surface-sunken',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        {removes ? '🗑' : '−'}
      </button>

      <span
        aria-live="polite"
        className={cn(
          'min-w-9 text-center font-semibold tabular-nums',
          size === 'sm' ? 'text-sm' : 'text-base',
        )}
      >
        {value}
      </span>

      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label={`Increase ${label}`}
        className={cn(
          buttonSize,
          'flex items-center justify-center rounded-r-xl font-semibold transition',
          'text-brand-700 hover:bg-brand-50 active:bg-brand-100',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        +
      </button>
    </div>
  );
}

export const QtyStepper = memo(QtyStepperComponent);
