import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { CART_LIMITS } from '@/lib/constants';
import type { CartLine } from '@/lib/types';
import { newIdempotencyKey } from '@/lib/utils';

/**
 * Unsubmitted carts — the only client-owned state in the app.
 *
 * Everything else the server owns and RTK Query caches. This exists because a
 * cart genuinely does not exist server-side until "Place Order" is tapped.
 *
 * Keyed by *scope* rather than being a single cart: a customer's phone has one
 * (the table code), but a waiter walking the floor may be building an order for
 * M2 while R4's order is half-typed, and losing one to open the other would be
 * unusable in service.
 */

export interface Cart {
  lines: CartLine[];
  /**
   * Generated once per cart, sent with the round, and only rotated after a
   * successful submit. That is what makes a double-tapped button, or a retry
   * after dropped Wi-Fi, return the original round instead of sending a second
   * ticket to the kitchen.
   */
  idempotencyKey: string;
}

interface CartState {
  carts: Record<string, Cart>;
}

const STORAGE_KEY = 'acd_cafe_carts';

/**
 * Carts survive a page reload.
 *
 * A guest on weak veranda Wi-Fi who reloads mid-order should not lose their
 * basket. Submitted rounds are never stored here — those live on the server,
 * which is the only source of truth for anything that was actually placed.
 */
function loadPersistedCarts(): Record<string, Cart> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Cart>) : {};
  } catch {
    return {};
  }
}

function persistCarts(carts: Record<string, Cart>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(carts));
  } catch {
    /* quota or private mode — the in-memory cart still works for this visit */
  }
}

const initialState: CartState = { carts: {} };

/** Returns the cart for a scope, creating an empty one on first touch. */
function cartFor(state: CartState, scope: string): Cart {
  state.carts[scope] ??= { lines: [], idempotencyKey: newIdempotencyKey() };
  return state.carts[scope];
}

/**
 * Two lines merge only when the item *and* its instructions match.
 *
 * "1 Tea, no sugar" and "1 Tea" are two different jobs for the kitchen, so
 * they stay two lines — the same rule the backend applies server-side.
 */
function sameLine(line: CartLine, productCode: string, instructions: string): boolean {
  return line.productCode === productCode && line.specialInstructions === instructions;
}

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    /** Restores persisted carts on mount. Client-only; never runs during SSR. */
    cartsHydrated(state) {
      state.carts = loadPersistedCarts();
    },

    addLine(
      state,
      action: PayloadAction<{
        scope: string;
        productCode: string;
        displayName: string;
        unitPrice: number;
        quantity?: number;
        specialInstructions?: string;
      }>,
    ) {
      const { scope, productCode, displayName, unitPrice } = action.payload;
      const instructions = action.payload.specialInstructions ?? '';
      const quantity = action.payload.quantity ?? 1;

      const cart = cartFor(state, scope);
      const existing = cart.lines.find((line) => sameLine(line, productCode, instructions));

      if (existing) {
        existing.quantity = Math.min(
          CART_LIMITS.MAX_QUANTITY_PER_ITEM,
          existing.quantity + quantity,
        );
      } else if (cart.lines.length < CART_LIMITS.MAX_ITEMS_PER_ROUND) {
        cart.lines.push({
          productCode,
          displayName,
          unitPrice,
          quantity: Math.min(CART_LIMITS.MAX_QUANTITY_PER_ITEM, quantity),
          specialInstructions: instructions,
        });
      }

      persistCarts(state.carts);
    },

    /** The qty stepper. Stepping to zero removes the line entirely. */
    setLineQuantity(
      state,
      action: PayloadAction<{ scope: string; index: number; quantity: number }>,
    ) {
      const { scope, index, quantity } = action.payload;
      const cart = state.carts[scope];
      if (!cart?.lines[index]) return;

      if (quantity <= 0) {
        cart.lines.splice(index, 1);
      } else {
        cart.lines[index].quantity = Math.min(CART_LIMITS.MAX_QUANTITY_PER_ITEM, quantity);
      }

      persistCarts(state.carts);
    },

    setLineInstructions(
      state,
      action: PayloadAction<{ scope: string; index: number; specialInstructions: string }>,
    ) {
      const { scope, index, specialInstructions } = action.payload;
      const line = state.carts[scope]?.lines[index];
      if (!line) return;

      line.specialInstructions = specialInstructions.slice(
        0,
        CART_LIMITS.MAX_SPECIAL_INSTRUCTIONS_LENGTH,
      );
      persistCarts(state.carts);
    },

    removeLine(state, action: PayloadAction<{ scope: string; index: number }>) {
      state.carts[action.payload.scope]?.lines.splice(action.payload.index, 1);
      persistCarts(state.carts);
    },

    /**
     * Called only after the server has acknowledged the round.
     *
     * The new key means the *next* order is a genuinely new submission, while
     * a retry of the one just sent still carries the old key.
     */
    cartSubmitted(state, action: PayloadAction<{ scope: string }>) {
      state.carts[action.payload.scope] = { lines: [], idempotencyKey: newIdempotencyKey() };
      persistCarts(state.carts);
    },

    clearCart(state, action: PayloadAction<{ scope: string }>) {
      delete state.carts[action.payload.scope];
      persistCarts(state.carts);
    },
  },
});

export const {
  cartsHydrated,
  addLine,
  setLineQuantity,
  setLineInstructions,
  removeLine,
  cartSubmitted,
  clearCart,
} = cartSlice.actions;

export default cartSlice.reducer;
