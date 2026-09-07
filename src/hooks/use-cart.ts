'use client';

import { useCallback, useMemo } from 'react';

import { ORDER_TYPE, type OrderType } from '@/lib/constants';
import type { CartLine, MenuItem, OrderItemInput } from '@/lib/types';
import { sumBy } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  addLine,
  cartSubmitted,
  clearCart,
  removeLine,
  setCartOrderType,
  setLineInstructions,
  setLineQuantity,
} from '@/store/slices/cart-slice';

const EMPTY_LINES: CartLine[] = [];

/**
 * One cart, addressed by scope.
 *
 * The scope is the table code on a customer's phone and the tableId on a waiter's
 * — so a waiter can hold a half-built order for M2 while opening R4, and a
 * guest's basket survives a page reload on weak Wi-Fi.
 *
 * The totals here are for display only. The server prices every line from
 * ProductMaster at order time, which is why a stale menu price on a phone
 * cannot become a wrong bill.
 */
export function useCart(scope: string) {
  const dispatch = useAppDispatch();
  const cart = useAppSelector((state) => state.cart.carts[scope]);

  const lines = cart?.lines ?? EMPTY_LINES;

  const add = useCallback(
    (item: MenuItem, quantity = 1, specialInstructions = '') => {
      dispatch(
        addLine({
          scope,
          productCode: item.productCode,
          displayName: item.displayName,
          unitPrice: item.price,
          quantity,
          specialInstructions,
        }),
      );
    },
    [dispatch, scope],
  );

  const setQuantity = useCallback(
    (index: number, quantity: number) => dispatch(setLineQuantity({ scope, index, quantity })),
    [dispatch, scope],
  );

  const setInstructions = useCallback(
    (index: number, specialInstructions: string) =>
      dispatch(setLineInstructions({ scope, index, specialInstructions })),
    [dispatch, scope],
  );

  const remove = useCallback(
    (index: number) => dispatch(removeLine({ scope, index })),
    [dispatch, scope],
  );

  /**
   * Dining or parcel for the round about to be sent.
   *
   * Only staff screens call this. The customer order page never does, because
   * the public endpoint ignores the field — a toggle there would be a control
   * that silently does nothing.
   */
  const setOrderType = useCallback(
    (orderType: OrderType) => dispatch(setCartOrderType({ scope, orderType })),
    [dispatch, scope],
  );

  /** Call only after the server acknowledges the round. */
  const markSubmitted = useCallback(() => dispatch(cartSubmitted({ scope })), [dispatch, scope]);

  const clear = useCallback(() => dispatch(clearCart({ scope })), [dispatch, scope]);

  const totals = useMemo(
    () => ({
      itemCount: sumBy(lines, (line) => line.quantity),
      /** Indicative only — tax and the authoritative total come from the server. */
      estimatedSubtotal: sumBy(lines, (line) => line.quantity * line.unitPrice),
    }),
    [lines],
  );

  /** Exactly what the API accepts: codes and quantities, never prices. */
  const toOrderItems = useCallback(
    (): OrderItemInput[] =>
      lines.map((line) => ({
        productCode: line.productCode,
        quantity: line.quantity,
        ...(line.specialInstructions ? { specialInstructions: line.specialInstructions } : {}),
      })),
    [lines],
  );

  /** Quantity of one product across the cart — drives the badge on a menu card. */
  const quantityOf = useCallback(
    (productCode: string) =>
      sumBy(
        lines.filter((line) => line.productCode === productCode),
        (line) => line.quantity,
      ),
    [lines],
  );

  return {
    lines,
    totals,
    // Falls back rather than trusting the stored cart: one persisted before
    // this field existed has no type on it.
    orderType: cart?.orderType ?? ORDER_TYPE.DINING,
    setOrderType,
    idempotencyKey: cart?.idempotencyKey ?? '',
    isEmpty: lines.length === 0,
    add,
    setQuantity,
    setInstructions,
    remove,
    markSubmitted,
    clear,
    toOrderItems,
    quantityOf,
  };
}
