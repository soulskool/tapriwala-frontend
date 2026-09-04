import { createAction, type Middleware } from '@reduxjs/toolkit';
import { io, type Socket } from 'socket.io-client';

import { SOCKET_URL } from '@/lib/api-config';
import { SOCKET_EVENTS } from '@/lib/constants';
import { adminApi } from '../api/admin-api';
import { billingApi } from '../api/billing-api';
import { customerApi } from '../api/customer-api';
import { kitchenApi } from '../api/kitchen-api';
import { menuApi } from '../api/menu-api';
import { serviceRequestApi } from '../api/service-request-api';
import { sessionApi } from '../api/session-api';
import { tableApi } from '../api/table-api';
import { connectionChanged } from '../slices/ui-slice';

/**
 * The one place realtime is wired.
 *
 * Every socket event lands here and turns into a cache effect. Nothing else in
 * the app touches a socket, which means "why didn't the board update?" has
 * exactly one file to read.
 *
 * Two kinds of effect, chosen per event:
 *   • `updateQueryData` — a cheap, known patch (an item ticked to Ready).
 *     No network round-trip, so a busy kitchen does not re-fetch the whole
 *     board on every tap.
 *   • `invalidateTags`  — a structural change (a whole new round). Cheaper to
 *     re-read the truth than to reconstruct it from a payload.
 *
 * Note the queries patched below are all keyed on `undefined`. The live
 * screens deliberately fetch unfiltered and filter client-side, so there is
 * exactly one cache entry per list to keep in step — a station filter baked
 * into the query key would silently strand every other cached variant.
 */

// ─── Actions the app dispatches at it ────────────────────────────────────────

/**
 * Open a connection.
 *
 * Staff pass `{ mode: 'staff' }` and nothing else — the session is an httpOnly
 * cookie, so there is no token for this app to hand over; `withCredentials`
 * below is what carries it into the handshake. Guests pass their table's QR
 * token, which is the whole of their identity.
 */
export const socketConnectRequested = createAction<
  { mode: 'staff' } | { mode: 'customer'; tableCode: string }
>('socket/connectRequested');

export const socketDisconnectRequested = createAction('socket/disconnectRequested');

// ─── Event payloads (mirrored from the backend's emitter) ────────────────────

interface RoundEventPayload {
  sessionId: string;
  tableId: string;
  tableCode: string;
}

interface ItemStatusPayload extends RoundEventPayload {
  roundId: string;
  itemId: string;
  status: string;
}

interface ProductAvailabilityPayload {
  productCode: string;
  displayName: string;
  price: number;
  isAvailable: boolean;
}

export const socketMiddleware: Middleware = (store) => {
  /**
   * `updateQueryData` returns a thunk, while `Middleware`'s dispatch is typed
   * for plain actions. Widened here rather than by importing `AppDispatch`,
   * which would put this file inside the store's own type graph — and the
   * store is built *from* this middleware, so that circle does not close.
   *
   * Only the acceptance is loosened: every expression handed to it below is
   * still fully type-checked where it is constructed.
   */
  const dispatch = store.dispatch as (action: unknown) => unknown;

  let socket: Socket | null = null;
  /** Remembered so customer-scoped caches can be invalidated by their key. */
  let tableCode: string | null = null;

  /** Re-reads every list a floor-wide change can touch. */
  function invalidateFloor(): void {
    dispatch(tableApi.util.invalidateTags(['LiveGrid']));
    dispatch(adminApi.util.invalidateTags(['Overview']));
  }

  function invalidateSession(sessionId: string | undefined): void {
    if (!sessionId) return;
    dispatch(sessionApi.util.invalidateTags([{ type: 'Session', id: sessionId }]));
    dispatch(billingApi.util.invalidateTags([{ type: 'Bill', id: sessionId }]));
  }

  function invalidateCustomerViews(): void {
    if (!tableCode) return;
    dispatch(customerApi.util.invalidateTags(['OrderStatus', 'Table']));
  }

  /**
   * Re-read everything after a dropped connection.
   *
   * Sockets notify; REST tells the truth. Any event broadcast while this device
   * was disconnected is simply gone — Socket.IO's `connectionStateRecovery`
   * replays a couple of minutes' worth and then gives up, and a server restart
   * loses it all. Past that window the board would sit there looking live and
   * green while showing a stale queue, which is the worst of both worlds.
   *
   * RTK Query's own `refetchOnReconnect` does not cover this: it fires on the
   * *browser's* online event, and a socket can drop (deploy, restart, proxy
   * timeout) while the browser never leaves the network at all.
   *
   * Every tag is invalidated rather than a chosen few. Only mounted queries
   * actually refetch, so a kitchen tablet re-reads the board and nothing else.
   */
  function resyncAfterReconnect(): void {
    dispatch(kitchenApi.util.invalidateTags(['Queue', 'Ready']));
    dispatch(sessionApi.util.invalidateTags(['Session', 'SessionList']));
    dispatch(billingApi.util.invalidateTags(['BillingQueue', 'Bill', 'Export']));
    dispatch(serviceRequestApi.util.invalidateTags(['Queue', 'RequestList']));
    dispatch(menuApi.util.invalidateTags(['Menu', 'Product']));
    dispatch(tableApi.util.invalidateTags(['LiveGrid']));
    dispatch(adminApi.util.invalidateTags(['Overview']));
    if (tableCode) {
      dispatch(customerApi.util.invalidateTags(['Table', 'Menu', 'OrderStatus']));
    }
  }

  function attach(instance: Socket): void {
    /**
     * True once this socket has connected at least once.
     *
     * The first `connect` needs no resync — the screen's queries are already
     * loading from its own mount. Resyncing there would double every request
     * the app makes on open.
     */
    let hasConnectedBefore = false;

    instance.on('connect', () => {
      dispatch(connectionChanged('online'));
      if (hasConnectedBefore) resyncAfterReconnect();
      hasConnectedBefore = true;
    });
    instance.on('disconnect', () => dispatch(connectionChanged('offline')));
    instance.on('connect_error', () => dispatch(connectionChanged('offline')));

    /**
     * A new round is structural — new ticket on the board, new tile colour,
     * new bill line. Re-read rather than trying to splice a ticket in.
     */
    instance.on(SOCKET_EVENTS.ROUND_NEW, (payload: RoundEventPayload) => {
      dispatch(kitchenApi.util.invalidateTags(['Queue']));
      dispatch(sessionApi.util.invalidateTags(['SessionList']));
      invalidateSession(payload?.sessionId);
      invalidateFloor();
      invalidateCustomerViews();
    });

    /**
     * An item ticking forward is the highest-frequency event in the system, so
     * it is patched in place instead of re-fetching the board.
     */
    instance.on(SOCKET_EVENTS.ROUND_ITEM_STATUS, (payload: ItemStatusPayload) => {
      dispatch(
        kitchenApi.util.updateQueryData('queue', undefined, (draft) => {
          const item = draft.tickets
            .find((ticket) => ticket.roundId === payload.roundId)
            ?.items.find((line) => line.itemId === payload.itemId);
          if (item) item.status = payload.status as typeof item.status;
        }),
      );
      dispatch(sessionApi.util.invalidateTags([{ type: 'Session', id: payload.sessionId }]));
      dispatch(kitchenApi.util.invalidateTags(['Ready']));
      invalidateFloor();
      invalidateCustomerViews();
    });

    /** A whole ticket moved — its status pill and the tile both change. */
    instance.on(SOCKET_EVENTS.ROUND_STATUS, (payload: RoundEventPayload) => {
      dispatch(kitchenApi.util.invalidateTags(['Queue', 'Ready']));
      invalidateSession(payload?.sessionId);
      invalidateFloor();
      invalidateCustomerViews();
    });

    instance.on(SOCKET_EVENTS.SESSION_STATUS_CHANGE, (payload: RoundEventPayload) => {
      invalidateSession(payload?.sessionId);
      dispatch(sessionApi.util.invalidateTags(['SessionList']));
      dispatch(billingApi.util.invalidateTags(['BillingQueue']));
      invalidateFloor();
      invalidateCustomerViews();
    });

    instance.on(SOCKET_EVENTS.SESSION_OPENED, () => {
      dispatch(sessionApi.util.invalidateTags(['SessionList']));
      invalidateFloor();
      invalidateCustomerViews();
    });

    instance.on(SOCKET_EVENTS.SESSION_CLOSED, (payload: RoundEventPayload) => {
      invalidateSession(payload?.sessionId);
      dispatch(sessionApi.util.invalidateTags(['SessionList']));
      dispatch(billingApi.util.invalidateTags(['BillingQueue', 'Export']));
      dispatch(kitchenApi.util.invalidateTags(['Queue', 'Ready']));
      invalidateFloor();
      invalidateCustomerViews();
    });

    const onServiceRequest = () => {
      dispatch(serviceRequestApi.util.invalidateTags(['Queue', 'RequestList']));
      dispatch(billingApi.util.invalidateTags(['BillingQueue']));
      invalidateFloor();
      invalidateCustomerViews();
    };
    instance.on(SOCKET_EVENTS.SERVICE_REQUEST_NEW, onServiceRequest);
    instance.on(SOCKET_EVENTS.SERVICE_REQUEST_UPDATE, onServiceRequest);

    /**
     * The 86 toggle.
     *
     * Patched into both menus rather than invalidated: this is broadcast to
     * *every* connected device, and a café full of phones all re-fetching the
     * menu because one sandwich ran out is a self-inflicted load spike.
     */
    instance.on(SOCKET_EVENTS.PRODUCT_AVAILABILITY, (payload: ProductAvailabilityPayload) => {
      dispatch(
        menuApi.util.updateQueryData('staffMenu', undefined, (draft) => {
          for (const category of draft) {
            for (const item of category.items) {
              if (item.productCode === payload.productCode) {
                item.isAvailable = payload.isAvailable;
                item.price = payload.price;
              }
            }
          }
        }),
      );
      dispatch(menuApi.util.invalidateTags(['Product']));

      // A guest's menu hides unavailable items entirely rather than greying
      // them out, so removing the line is the correct patch, not a flag flip.
      if (tableCode) {
        dispatch(
          customerApi.util.updateQueryData('menu', tableCode, (draft) => {
            for (const category of draft) {
              const index = category.items.findIndex(
                (item) => item.productCode === payload.productCode,
              );
              if (index === -1) continue;
              if (payload.isAvailable) category.items[index].isAvailable = true;
              else category.items.splice(index, 1);
            }
          }),
        );
        // An item that came *back* was not in the customer's list to patch.
        if (payload.isAvailable) {
          dispatch(customerApi.util.invalidateTags(['Menu']));
        }
      }
    });

    instance.on(SOCKET_EVENTS.TABLE_STATUS, invalidateFloor);
  }

  return (next) => (action) => {
    if (socketConnectRequested.match(action)) {
      // Reconnecting with different credentials must not leave the old socket
      // in a room it should no longer be in.
      socket?.disconnect();

      tableCode = action.payload.mode === 'customer' ? action.payload.tableCode : null;
      dispatch(connectionChanged('connecting'));

      socket = io(SOCKET_URL, {
        // Staff send nothing here and are identified by their cookie; a guest
        // sends the token from their table's QR.
        auth: tableCode ? { tableCode } : {},
        // Carries the httpOnly session cookie into the handshake. Without it a
        // staff socket connects anonymously and the server refuses it.
        withCredentials: true,
        // Transport order is left at Socket.IO's default — polling first, then
        // an upgrade to WebSocket — and that is load-bearing: the cookie only
        // rides along with the *polling* handshake. Forcing
        // `transports: ['websocket']` here authenticates staff as anonymous.
        // Verified the hard way; do not "optimise" it away.
        //
        // Floor Wi-Fi drops. Keep retrying, but back off so a dead server does
        // not get hammered by twenty devices at once.
        reconnection: true,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 10_000,
      });

      attach(socket);
      return next(action);
    }

    if (socketDisconnectRequested.match(action)) {
      socket?.disconnect();
      socket = null;
      tableCode = null;
      dispatch(connectionChanged('offline'));
      return next(action);
    }

    return next(action);
  };
};
