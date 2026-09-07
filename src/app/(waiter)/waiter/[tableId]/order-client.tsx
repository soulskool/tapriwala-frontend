'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CartDrawer } from '@/components/menu/cart-drawer';
import { Button } from '@/components/ui/button';
import { TextAreaField } from '@/components/ui/field';
import { ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/modal';
import { StatusPill } from '@/components/ui/status-pill';
import { ItemPicker } from '@/components/waiter/item-picker';
import { SessionRounds } from '@/components/waiter/session-rounds';
import { useCart } from '@/hooks/use-cart';
import { OrderTypeToggle } from '@/components/ui/order-type-pill';
import {
  ITEM_STATUS,
  ORDER_TYPE_LABEL,
  ROLES,
  SERVICE_REQUEST_TYPE,
  type ItemStatus,
} from '@/lib/constants';
import type { MenuItem, OrderItem, OrderRound } from '@/lib/types';
import { IconBack, IconBill } from '@/components/ui/icons';
import { formatCurrency, formatElapsed } from '@/lib/utils';
import { apiErrorMessage } from '@/store/api/base-query';
import { useStaffMenuQuery } from '@/store/api/menu-api';
import { useRaiseRequestMutation } from '@/store/api/service-request-api';
import {
  useCloseSessionMutation,
  useOpenSessionMutation,
  usePlaceRoundMutation,
  useSessionDetailQuery,
  useUpdateItemStatusMutation,
} from '@/store/api/session-api';
import { useLiveGridQuery } from '@/store/api/table-api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { canAccess } from '@/store/slices/auth-slice';
import { toastPushed } from '@/store/slices/ui-slice';

/**
 * One table's screen.
 *
 * The session id is looked up from the live grid rather than being passed in
 * the URL, because a waiter arrives here from a tile and a table may not have
 * a session yet — tapping an empty table is how one gets opened.
 */
export function TableOrderClient({ tableId }: { tableId: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);

  // Mirrors `authorize(ROLES.BILLING)` on the backend route, admin bypass and
  // all -- a waiter must not be able to walk away from an unpaid table.
  const canFreeTable = canAccess(user, [ROLES.BILLING]);

  // Same role test, deliberately named separately: settling a table and writing
  // one off are different decisions that could reasonably diverge later.
  //
  // This exists because the common case is not the one the flow was built for.
  // A guest who ordered from their own phone very often just asks whoever walks
  // past for the bill, and "Request bill" only puts the table in the counter's
  // queue. Billing and admin can go straight to the bill from here instead.
  const canSettleTable = canAccess(user, [ROLES.BILLING]);

  const grid = useLiveGridQuery();
  const tile = grid.data?.tables.find((entry) => entry.tableId === tableId);
  const sessionId = tile?.sessionId ?? null;

  const detail = useSessionDetailQuery(sessionId ?? '', { skip: !sessionId });
  const { data: menu = [] } = useStaffMenuQuery();

  const [openSession, { isLoading: isOpening }] = useOpenSessionMutation();
  const [placeRound, { isLoading: isPlacing }] = usePlaceRoundMutation();
  const [updateItemStatus] = useUpdateItemStatusMutation();
  const [raiseRequest] = useRaiseRequestMutation();
  const [closeSession, { isLoading: isFreeing }] = useCloseSessionMutation();

  const cart = useCart(tableId);
  const [cartOpen, setCartOpen] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ round: OrderRound; item: OrderItem } | null>(
    null,
  );
  const [cancelReason, setCancelReason] = useState('');
  const [freeOpen, setFreeOpen] = useState(false);
  const [freeReason, setFreeReason] = useState('');

  // Freeing a table that never ordered anything is routine tidying and should
  // cost one tap. Freeing one that owes money is a decision, and a decision
  // needs a name against it in the audit log.
  const needsFreeReason = Boolean(tile && (tile.roundCount > 0 || tile.runningTotal > 0));

  function handleSetQuantity(item: MenuItem, quantity: number) {
    const index = cart.lines.findIndex(
      (line) => line.productCode === item.productCode && line.specialInstructions === '',
    );
    if (index >= 0) cart.setQuantity(index, quantity);
    else if (quantity > 0) cart.add(item, quantity);
  }

  async function handlePlaceOrder() {
    if (cart.isEmpty || isPlacing) return;

    try {
      // Opening is idempotent server-side: two waiters tapping the same table
      // land in the same session, so this is safe to call every time.
      const targetSessionId = sessionId ?? String((await openSession({ tableId }).unwrap())._id);

      const placed = await placeRound({
        sessionId: targetSessionId,
        items: cart.toOrderItems(),
        orderType: cart.orderType,
        idempotencyKey: cart.idempotencyKey,
      }).unwrap();

      // Read off the cart *before* markSubmitted resets it to dining.
      const sentAs = ORDER_TYPE_LABEL[cart.orderType].toLowerCase();

      cart.markSubmitted();
      setCartOpen(false);
      // Names the type back: a parcel sent as a dining round is only caught if
      // the confirmation says which one went, and it is fixable in the seconds
      // after sending rather than at the pass.
      dispatch(toastPushed(`Sent to the kitchen as ${sentAs} · KOT ${placed.kotId}`, 'success'));
    } catch (error) {
      // Loud and sticky: a waiter must never walk away believing an order went
      // through when it did not.
      dispatch(toastPushed(apiErrorMessage(error, 'Order NOT sent — try again'), 'error'));
    }
  }

  async function handleItemStatus(round: OrderRound, item: OrderItem, status: ItemStatus) {
    setBusyItemId(item._id);
    try {
      await updateItemStatus({
        roundId: round._id,
        itemId: item._id,
        status,
        sessionId: round.sessionId,
      }).unwrap();
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not update that item'), 'error'));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelTarget || !cancelReason.trim()) return;

    setBusyItemId(cancelTarget.item._id);
    try {
      await updateItemStatus({
        roundId: cancelTarget.round._id,
        itemId: cancelTarget.item._id,
        status: ITEM_STATUS.CANCELLED,
        // Always required by the API — this is the audit trail for a dispute.
        reason: cancelReason.trim(),
        sessionId: cancelTarget.round.sessionId,
      }).unwrap();

      dispatch(toastPushed('Item cancelled', 'success'));
      setCancelTarget(null);
      setCancelReason('');
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not cancel that item'), 'error'));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleRequestBill() {
    try {
      await raiseRequest({ tableId, type: SERVICE_REQUEST_TYPE.BILL }).unwrap();
      dispatch(toastPushed('Bill requested — the counter has been told', 'success'));
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not request the bill'), 'error'));
    }
  }

  /**
   * Frees the table without billing it.
   *
   * The escape hatch for a broken flow: an order placed from a copied QR link
   * onto a table nobody is sitting at, a session opened on the wrong table, a
   * group that walked out. It closes with `force`, so it still works when the
   * kitchen has live items or the session is held for review -- those are the
   * exact cases that strand a tile as occupied forever.
   *
   * Nothing is deleted. The session and its rounds stay queryable; the table
   * just stops being live, which releases the unique partial index and lets
   * the next guest open a genuinely fresh session.
   */
  async function handleFreeTable() {
    if (!sessionId) return;
    if (needsFreeReason && !freeReason.trim()) return;

    try {
      await closeSession({
        sessionId,
        force: true,
        note: `Freed without billing — ${freeReason.trim() || 'nothing was ordered'}`,
      }).unwrap();

      dispatch(toastPushed(`${tile?.code ?? 'Table'} is free`, 'success'));
      setFreeOpen(false);
      setFreeReason('');
      router.push('/waiter');
    } catch (error) {
      dispatch(toastPushed(apiErrorMessage(error, 'Could not free the table'), 'error'));
    }
  }

  if (grid.isLoading) return <LoadingBlock label="Loading table…" />;

  if (!tile) {
    return (
      <ErrorState
        message="That table is not on the floor plan."
        onRetry={() => void grid.refetch()}
      />
    );
  }

  const rounds = detail.data?.rounds ?? [];
  const totals = detail.data?.totals;
  const openRequests = (detail.data?.serviceRequests ?? []).filter(
    (request) => request.status === 'open' || request.status === 'acknowledged',
  );

  return (
    <div className="flex flex-col gap-5 pb-28">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/waiter" className="text-ink-muted text-sm hover:underline">
            <IconBack aria-hidden className="mr-1 inline size-4" /> Floor
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{tile.code}</h1>
          <p className="text-ink-muted text-sm">
            {tile.zone} · {tile.seatingCapacity} seats
            {sessionId ? ` · open ${formatElapsed(tile.minutesOpen)}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill status={tile.status} kind="tile" size="md" />
          {/* Kept for everyone, including billing: an admin crossing the floor
              may want to flag a table for whoever is actually on the counter
              rather than settle it themselves. */}
          {sessionId ? (
            <Button variant="secondary" onClick={() => void handleRequestBill()}>
              <IconBill aria-hidden className="mr-1.5 inline size-4" /> Request bill
            </Button>
          ) : null}
          {sessionId && canSettleTable ? (
            <Button onClick={() => router.push(`/billing/${sessionId}`)}>
              <IconBill aria-hidden className="mr-1.5 inline size-4" /> Bill this table
            </Button>
          ) : null}
          {sessionId && canFreeTable ? (
            <Button variant="danger" onClick={() => setFreeOpen(true)}>
              Free table
            </Button>
          ) : null}
        </div>
      </header>

      {openRequests.length > 0 ? (
        <p className="rounded-card border-status-pending/40 bg-status-pending-soft text-status-pending-ink border px-4 py-2.5 text-sm">
          Waiting on staff:{' '}
          {openRequests.map((request) => request.type.replace('_', ' ')).join(', ')}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Running order" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Running order</h2>
            {totals ? (
              <span className="font-semibold tabular-nums">{formatCurrency(totals.total)}</span>
            ) : null}
          </div>

          {!sessionId ? (
            <div className="rounded-card border-line bg-surface border border-dashed px-6 py-10 text-center">
              <p className="text-ink-muted mb-3">
                This table is empty. Adding the first item opens it.
              </p>
              <Button isLoading={isOpening} onClick={() => void openSession({ tableId }).unwrap()}>
                Open table now
              </Button>
            </div>
          ) : detail.isLoading ? (
            <LoadingBlock label="Loading the order…" />
          ) : rounds.length === 0 ? (
            <p className="rounded-card border-line bg-surface text-ink-muted border border-dashed px-6 py-10 text-center">
              Table is open, nothing ordered yet.
            </p>
          ) : (
            <SessionRounds
              rounds={rounds}
              busyItemId={busyItemId}
              onItemStatus={(round, item, status) => void handleItemStatus(round, item, status)}
              onCancelItem={(round, item) => setCancelTarget({ round, item })}
            />
          )}
        </section>

        <section aria-label="Add items" className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Add items</h2>
          <ItemPicker
            menu={menu}
            quantityOf={cart.quantityOf}
            onAdd={(item) => cart.add(item)}
            onSetQuantity={handleSetQuantity}
          />
        </section>
      </div>

      {!cart.isEmpty ? (
        <div className="border-line bg-surface/95 print-hidden fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3">
            <div className="flex-1">
              <p className="text-ink-muted text-sm">
                {cart.totals.itemCount} item{cart.totals.itemCount === 1 ? '' : 's'} for {tile.code}
              </p>
              <p className="font-bold tabular-nums">
                {formatCurrency(cart.totals.estimatedSubtotal)}
              </p>
            </div>
            {/* Also on the bar, not only inside the drawer: a waiter told
                "make that a parcel" while still adding items should not have
                to open the cart to act on it. Both controls drive the same
                one piece of state. */}
            <OrderTypeToggle
              value={cart.orderType}
              onChange={cart.setOrderType}
              label="Order type for this round"
              className="hidden sm:flex"
            />
            <Button variant="secondary" onClick={cart.clear}>
              Clear
            </Button>
            <Button size="lg" onClick={() => setCartOpen(true)}>
              Review &amp; send
            </Button>
          </div>
        </div>
      ) : null}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={cart.lines}
        estimatedSubtotal={cart.totals.estimatedSubtotal}
        itemCount={cart.totals.itemCount}
        isSubmitting={isPlacing || isOpening}
        onSetQuantity={cart.setQuantity}
        onSetInstructions={cart.setInstructions}
        onPlaceOrder={() => void handlePlaceOrder()}
        submitLabel={`Send to kitchen · ${tile.code}`}
        orderType={cart.orderType}
        onOrderTypeChange={cart.setOrderType}
      />

      <Modal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title={`Cancel ${cancelTarget?.item.displayName ?? 'item'}?`}
        description="Cancelled items stay in the history and are excluded from the bill. If the kitchen already started it, the session is held for a manager to review."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={!cancelReason.trim()}
              onClick={() => void handleConfirmCancel()}
            >
              Cancel item
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Reason"
          required
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          placeholder="e.g. guest changed their mind"
          hint="Recorded against your name in the audit log."
        />
      </Modal>

      <Modal
        open={freeOpen}
        onClose={() => setFreeOpen(false)}
        title={`Free ${tile.code} without billing?`}
        description="Use this when nobody is at the table — an order placed from a copied QR link, a session opened by mistake, or a group that left."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFreeOpen(false)}>
              Keep it open
            </Button>
            <Button
              variant="danger"
              isLoading={isFreeing}
              disabled={needsFreeReason && !freeReason.trim()}
              onClick={() => void handleFreeTable()}
            >
              Free the table
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {needsFreeReason ? (
            <div
              role="alert"
              className="rounded-card border-status-cancelled/40 bg-status-cancelled-soft text-status-cancelled-ink border px-3 py-2.5 text-sm"
            >
              <p className="font-semibold">This table will not be billed.</p>
              <ul className="mt-1.5 flex flex-col gap-0.5">
                <li>
                  {tile.roundCount} order{tile.roundCount === 1 ? '' : 's'} worth{' '}
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(tile.runningTotal)}
                  </span>
                </li>
                {tile.pendingItemCount > 0 ? (
                  <li>{tile.pendingItemCount} item(s) the kitchen has not finished</li>
                ) : null}
                {tile.readyItemCount > 0 ? (
                  <li>{tile.readyItemCount} item(s) sitting ready under the pass</li>
                ) : null}
              </ul>
            </div>
          ) : (
            <p className="text-ink-muted text-sm">
              Nothing has been ordered on this table, so there is nothing to bill.
            </p>
          )}

          <TextAreaField
            label="Reason"
            required={needsFreeReason}
            value={freeReason}
            onChange={(event) => setFreeReason(event.target.value)}
            placeholder={
              needsFreeReason ? 'e.g. fake order, nobody at the table' : 'Optional — tidying up'
            }
            hint="Recorded against your name in the audit log, with the amount written off."
          />

          <p className="text-ink-muted text-xs">
            Nothing is deleted — the session and its orders stay in the history. The table just
            stops being live, so the next guest starts fresh.
          </p>
        </div>
      </Modal>
    </div>
  );
}
