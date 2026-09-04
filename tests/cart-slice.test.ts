import { beforeEach, describe, expect, it } from 'vitest';

import { CART_LIMITS } from '@/lib/constants';
import type { Cart } from '@/store/slices/cart-slice';
import reducer, {
  addLine,
  cartSubmitted,
  clearCart,
  removeLine,
  setLineInstructions,
  setLineQuantity,
} from '@/store/slices/cart-slice';

/**
 * The cart — the only client-owned state in the app, and the one that decides
 * whether a guest gets charged once or twice.
 *
 * The rule under test is the idempotency key's lifetime: it must survive every
 * edit and rotate only after the server acknowledges the round. Rotate it a
 * moment too early and a double-tapped "Place Order" sends two tickets to the
 * kitchen and two lines to the bill.
 */

const scope = 'L5';
const tea = { scope, productCode: '105', displayName: 'Plain Tea Cutting', unitPrice: 25 };
const bun = { scope, productCode: '128', displayName: 'Bun Maska Jam', unitPrice: 60 };

/** Typed so `state.carts.M2` is an index into a real record, not into `{}`. */
const empty: { carts: Record<string, Cart> } = { carts: {} };

beforeEach(() => {
  window.localStorage.clear();
});

describe('idempotency key lifetime', () => {
  it('holds steady across every edit to the cart', () => {
    let state = reducer(empty, addLine(tea));
    const key = state.carts[scope].idempotencyKey;

    state = reducer(state, addLine(bun));
    state = reducer(state, setLineQuantity({ scope, index: 0, quantity: 3 }));
    state = reducer(
      state,
      setLineInstructions({ scope, index: 0, specialInstructions: 'no sugar' }),
    );
    state = reducer(state, removeLine({ scope, index: 1 }));

    expect(state.carts[scope].idempotencyKey).toBe(key);
  });

  it('rotates only once the server has acknowledged the round', () => {
    let state = reducer(empty, addLine(tea));
    const key = state.carts[scope].idempotencyKey;

    state = reducer(state, cartSubmitted({ scope }));

    expect(state.carts[scope].idempotencyKey).not.toBe(key);
    expect(state.carts[scope].lines).toEqual([]);
  });

  it('gives each table its own key, so two tables never collide', () => {
    // Idempotency is scoped per session server-side; the client must not hand
    // two tables the same key and let one be served the other's order.
    let state = reducer(empty, addLine(tea));
    state = reducer(state, addLine({ ...tea, scope: 'M2' }));

    expect(state.carts[scope].idempotencyKey).not.toBe(state.carts.M2.idempotencyKey);
  });

  it("keeps one table's cart intact while another is being built", () => {
    // A waiter half-typing M2's order must not lose L5's.
    let state = reducer(empty, addLine(tea));
    state = reducer(state, addLine({ ...bun, scope: 'M2' }));
    state = reducer(state, clearCart({ scope: 'M2' }));

    expect(state.carts[scope].lines).toHaveLength(1);
    expect(state.carts.M2).toBeUndefined();
  });
});

describe('line merging', () => {
  it('merges a repeat tap of the same item into one line', () => {
    let state = reducer(empty, addLine(tea));
    state = reducer(state, addLine(tea));

    expect(state.carts[scope].lines).toHaveLength(1);
    expect(state.carts[scope].lines[0].quantity).toBe(2);
  });

  it('keeps items with different instructions as separate lines', () => {
    // "1 Tea, no sugar" and "1 Tea" are two different jobs for the kitchen.
    let state = reducer(empty, addLine(tea));
    state = reducer(state, addLine({ ...tea, specialInstructions: 'no sugar' }));

    expect(state.carts[scope].lines).toHaveLength(2);
  });
});

describe('limits', () => {
  it('caps the quantity per item', () => {
    const state = reducer(
      empty,
      addLine({ ...tea, quantity: CART_LIMITS.MAX_QUANTITY_PER_ITEM + 50 }),
    );
    expect(state.carts[scope].lines[0].quantity).toBe(CART_LIMITS.MAX_QUANTITY_PER_ITEM);
  });

  it('caps the quantity when merging, not just on the first add', () => {
    let state = reducer(empty, addLine({ ...tea, quantity: CART_LIMITS.MAX_QUANTITY_PER_ITEM }));
    state = reducer(state, addLine({ ...tea, quantity: 5 }));
    expect(state.carts[scope].lines[0].quantity).toBe(CART_LIMITS.MAX_QUANTITY_PER_ITEM);
  });

  it('stops accepting new lines past the per-round limit', () => {
    let state = empty;
    for (let index = 0; index < CART_LIMITS.MAX_ITEMS_PER_ROUND + 5; index += 1) {
      state = reducer(state, addLine({ ...tea, productCode: `p${index}` }));
    }
    expect(state.carts[scope].lines).toHaveLength(CART_LIMITS.MAX_ITEMS_PER_ROUND);
  });

  it('truncates over-long special instructions rather than rejecting them', () => {
    let state = reducer(empty, addLine(tea));
    state = reducer(
      state,
      setLineInstructions({ scope, index: 0, specialInstructions: 'x'.repeat(5000) }),
    );
    expect(state.carts[scope].lines[0].specialInstructions).toHaveLength(
      CART_LIMITS.MAX_SPECIAL_INSTRUCTIONS_LENGTH,
    );
  });
});

describe('quantity stepper', () => {
  it('removes the line when stepped to zero', () => {
    let state = reducer(empty, addLine(tea));
    state = reducer(state, setLineQuantity({ scope, index: 0, quantity: 0 }));
    expect(state.carts[scope].lines).toHaveLength(0);
  });

  it('ignores an edit to a line that is no longer there', () => {
    // Two devices on the same waiter account can race; this must not throw.
    const state = reducer(empty, setLineQuantity({ scope, index: 7, quantity: 2 }));
    expect(state.carts[scope]).toBeUndefined();
  });
});
