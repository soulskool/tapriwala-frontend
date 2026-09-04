'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { QtyStepper } from '@/components/ui/qty-stepper';
import { CART_LIMITS } from '@/lib/constants';
import type { CartLine } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  lines: CartLine[];
  estimatedSubtotal: number;
  itemCount: number;
  isSubmitting: boolean;
  onSetQuantity: (index: number, quantity: number) => void;
  onSetInstructions: (index: number, instructions: string) => void;
  onPlaceOrder: () => void;
  submitLabel?: string;
  /** Shown above the button — e.g. the table is mid-bill and should not order. */
  blockedReason?: string | null;
}

/**
 * The cart, as a bottom sheet.
 *
 * A sheet rather than a separate route so the guest never loses their place in
 * the menu, and so the "Place Order" button is always under a thumb.
 */
export function CartDrawer({
  open,
  onClose,
  lines,
  estimatedSubtotal,
  itemCount,
  isSubmitting,
  onSetQuantity,
  onSetInstructions,
  onPlaceOrder,
  submitLabel = 'Place order',
  blockedReason = null,
}: CartDrawerProps) {
  if (!open) return null;

  return (
    <div className="print-hidden fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close cart"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <section
        aria-label="Your order"
        className="bg-surface animate-rise relative flex max-h-[85dvh] flex-col rounded-t-3xl shadow-2xl"
      >
        <header className="border-line flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-bold">
            Your order{' '}
            <span className="text-ink-muted tabular-nums">
              ({itemCount} {itemCount === 1 ? 'item' : 'items'})
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:bg-surface-sunken flex size-9 items-center justify-center rounded-lg"
          >
            ✕
          </button>
        </header>

        <ul className="divide-line flex-1 divide-y overflow-y-auto px-5">
          {lines.map((line, index) => (
            <CartLineRow
              /*
               * The note text must NOT be part of this key. It used to be, and
               * every keystroke changed the key, which told React to throw the
               * row away and mount a fresh one: the input lost focus after a
               * single character and the phone keyboard closed. The line's
               * position is what identifies it here.
               */
              key={`${line.productCode}-${index}`}
              line={line}
              onQuantityChange={(quantity) => onSetQuantity(index, quantity)}
              onInstructionsChange={(instructions) => onSetInstructions(index, instructions)}
            />
          ))}
        </ul>

        <footer className="border-line bg-surface-muted border-t px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-ink-muted text-sm">Estimated subtotal</span>
            <span className="text-xl font-bold tabular-nums">
              {formatCurrency(estimatedSubtotal)}
            </span>
          </div>
          {/* The bill is computed server-side from ProductMaster, so this is a
              guide, not a promise — saying so avoids an argument at the till. */}
          <p className="text-ink-muted mb-3 text-xs">Taxes are added on the final bill.</p>

          {blockedReason ? (
            <p className="bg-status-pending-soft text-status-pending-ink mb-3 rounded-xl px-3 py-2 text-sm">
              {blockedReason}
            </p>
          ) : null}

          <Button
            size="lg"
            fullWidth
            isLoading={isSubmitting}
            disabled={lines.length === 0 || Boolean(blockedReason)}
            onClick={onPlaceOrder}
          >
            {submitLabel}
          </Button>
        </footer>
      </section>
    </div>
  );
}

interface CartLineRowProps {
  line: CartLine;
  onQuantityChange: (quantity: number) => void;
  onInstructionsChange: (instructions: string) => void;
}

function CartLineRow({ line, onQuantityChange, onInstructionsChange }: CartLineRowProps) {
  const [noteOpen, setNoteOpen] = useState(Boolean(line.specialInstructions));

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{line.displayName}</p>
          <p className="text-ink-muted text-sm tabular-nums">
            {formatCurrency(line.unitPrice)} each
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <QtyStepper
            size="sm"
            value={line.quantity}
            label={line.displayName}
            onChange={onQuantityChange}
          />
          <span className="text-sm font-semibold tabular-nums">
            {formatCurrency(line.unitPrice * line.quantity)}
          </span>
        </div>
      </div>

      {noteOpen ? (
        <input
          type="text"
          autoFocus={!line.specialInstructions}
          value={line.specialInstructions}
          maxLength={CART_LIMITS.MAX_SPECIAL_INSTRUCTIONS_LENGTH}
          onChange={(event) => onInstructionsChange(event.target.value)}
          placeholder="e.g. less sugar, no onion"
          aria-label={`Special instructions for ${line.displayName}`}
          className="border-line bg-surface mt-2 w-full rounded-lg border px-3 py-2 text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className={cn('text-brand-700 mt-1 text-sm font-medium hover:underline')}
        >
          + Add a note
        </button>
      )}
    </li>
  );
}
