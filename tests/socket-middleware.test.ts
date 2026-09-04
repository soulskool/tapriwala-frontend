import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SOCKET_EVENTS } from '@/lib/constants';
import type { KdsTicket, KitchenQueueResponse, MenuCategory } from '@/lib/types';

/**
 * The realtime wiring, exercised through the real store.
 *
 * This is an integration test on purpose: it builds the actual store with the
 * actual RTK Query caches and the actual middleware, fakes only the socket
 * itself, and then asserts that a server event reaches the cache. Unit-testing
 * the middleware in isolation would prove nothing — the whole value of this
 * file is that the event name, the middleware handler and the query cache all
 * line up.
 *
 * It touches no component, so a redesign cannot break it.
 */

/** A stand-in for the socket.io client: records handlers, lets tests fire them. */
class FakeSocket {
  handlers = new Map<string, ((payload?: unknown) => void)[]>();
  disconnected = false;

  on(event: string, handler: (payload?: unknown) => void): this {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler);
    this.handlers.set(event, existing);
    return this;
  }

  emit(): this {
    return this;
  }

  disconnect(): this {
    this.disconnected = true;
    return this;
  }

  /** Simulate the server pushing an event down. */
  fire(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
}

let fakeSocket: FakeSocket;
const ioOptions = vi.fn();

vi.mock('socket.io-client', () => ({
  io: (_url: string, options: unknown) => {
    ioOptions(options);
    fakeSocket = new FakeSocket();
    return fakeSocket;
  },
}));

const { makeStore } = await import('@/store');
const { socketConnectRequested, socketDisconnectRequested } =
  await import('@/store/socket/socket-middleware');
const { kitchenApi } = await import('@/store/api/kitchen-api');
const { customerApi } = await import('@/store/api/customer-api');

function ticket(over: Partial<KdsTicket> = {}): KdsTicket {
  return {
    roundId: 'r1',
    sessionId: 's1',
    tableId: 't1',
    tableCode: 'O3',
    zone: 'Lawn',
    kotId: '1006',
    roundNumber: 1,
    isAddOn: false,
    source: 'customer_qr',
    placedAt: '2026-09-03T09:57:35.139Z',
    elapsedMinutes: 0,
    status: 'pending',
    items: [
      {
        itemId: 'i1',
        productCode: '105',
        displayName: 'Plain Tea Cutting',
        quantity: 2,
        specialInstructions: '',
        kitchenStation: 'Beverage',
        status: 'pending',
        unavailable: false,
      },
    ],
    ...over,
  };
}

const queue = (): KitchenQueueResponse => ({
  tickets: [ticket()],
  count: 1,
  generatedAt: '2026-09-03T09:57:35.139Z',
});

describe('socket connection', () => {
  beforeEach(() => {
    ioOptions.mockClear();
  });

  it('carries the httpOnly cookie into the handshake', () => {
    // Without withCredentials a staff socket connects anonymously and the
    // server refuses it. This has broken before.
    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'staff' }));

    expect(ioOptions).toHaveBeenCalledWith(expect.objectContaining({ withCredentials: true }));
  });

  it('never pins the transport to websocket', () => {
    // The cookie only rides along with the *polling* handshake, so forcing
    // `transports: ['websocket']` silently authenticates every staff member as
    // anonymous. Guard the absence of that option.
    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'staff' }));

    const options = ioOptions.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.transports).toBeUndefined();
  });

  it('identifies a guest by table code and a staff member by neither', () => {
    const store = makeStore();

    store.dispatch(socketConnectRequested({ mode: 'customer', tableCode: 'L5' }));
    expect(ioOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ auth: { tableCode: 'L5' } }),
    );

    store.dispatch(socketConnectRequested({ mode: 'staff' }));
    expect(ioOptions).toHaveBeenLastCalledWith(expect.objectContaining({ auth: {} }));
  });

  it('keeps retrying with a backoff so twenty devices do not hammer a dead server', () => {
    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'staff' }));

    const options = ioOptions.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.reconnection).toBe(true);
    expect(options.reconnectionDelayMax).toBeGreaterThan(options.reconnectionDelay as number);
  });

  it('drops the previous socket when reconnecting with new credentials', () => {
    // Otherwise a device that switches from guest to staff stays in the old
    // table room and keeps receiving another table's traffic.
    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'customer', tableCode: 'L5' }));
    const first = fakeSocket;

    store.dispatch(socketConnectRequested({ mode: 'staff' }));
    expect(first.disconnected).toBe(true);
  });

  it('tracks connection state for the Live badge', () => {
    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'staff' }));
    expect(store.getState().ui.connection).toBe('connecting');

    fakeSocket.fire('connect');
    expect(store.getState().ui.connection).toBe('online');

    fakeSocket.fire('disconnect');
    expect(store.getState().ui.connection).toBe('offline');

    fakeSocket.fire('connect');
    store.dispatch(socketDisconnectRequested());
    expect(store.getState().ui.connection).toBe('offline');
  });
});

describe('reconnect re-reads the truth', () => {
  it('does NOT resync on the very first connect', async () => {
    // The screen's own queries are already loading at mount; resyncing here
    // would double every request the app makes on open.
    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'staff' }));
    await store.dispatch(kitchenApi.util.upsertQueryData('queue', undefined, queue()));

    fakeSocket.fire('connect');

    const cached = kitchenApi.endpoints.queue.select(undefined)(store.getState()).data;
    // Untouched: no invalidation was issued, so the seeded cache still stands.
    expect(cached?.tickets[0].items[0].status).toBe('pending');
  });

  it('throws the stale queue away after a drop and reconnect', async () => {
    // Rule 7: a client that reconnects re-fetches. Socket.IO's own recovery
    // window is two minutes and a server restart loses even that, so anything
    // broadcast while this device was away is simply gone. What must never
    // happen is the board sitting there green and live, showing old food.
    //
    // With no component subscribed, invalidation evicts the entry outright;
    // on a real screen the same invalidation triggers the refetch. Either way
    // the stale data stops being served, which is the property under test.
    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'staff' }));
    await store.dispatch(kitchenApi.util.upsertQueryData('queue', undefined, queue()));

    fakeSocket.fire('connect');
    expect(
      kitchenApi.endpoints.queue.select(undefined)(store.getState()).data,
      'first connect must not discard anything',
    ).toBeDefined();

    // The Wi-Fi drops and comes back.
    fakeSocket.fire('disconnect');
    fakeSocket.fire('connect');

    expect(kitchenApi.endpoints.queue.select(undefined)(store.getState()).data).toBeUndefined();
  });

  it('resyncs the guest views too, but only for the table this phone is on', async () => {
    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'customer', tableCode: 'L5' }));
    await store.dispatch(customerApi.util.upsertQueryData('menu', 'L5', []));

    fakeSocket.fire('connect');
    fakeSocket.fire('disconnect');
    fakeSocket.fire('connect');

    expect(customerApi.endpoints.menu.select('L5')(store.getState()).data).toBeUndefined();
  });
});

describe('socket events reach the cache', () => {
  it('subscribes only to event names that exist in the shared contract', () => {
    // A typo'd string literal here is invisible: the handler simply never
    // fires, and the board silently stops updating.
    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'staff' }));

    // 'connect', 'disconnect' and 'connect_error' are socket.io's own
    // transport events, not part of our domain contract.
    const known = new Set<string>([
      ...Object.values(SOCKET_EVENTS),
      'connect',
      'disconnect',
      'connect_error',
    ]);
    for (const event of fakeSocket.handlers.keys()) {
      expect(known, `middleware listens for unknown event "${event}"`).toContain(event);
    }
  });

  it('patches an item status into the queue in place, without refetching', async () => {
    // This is the highest-frequency event in the system. Re-fetching the whole
    // board on every tap is what this patch exists to avoid.
    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'staff' }));
    await store.dispatch(kitchenApi.util.upsertQueryData('queue', undefined, queue()));

    fakeSocket.fire(SOCKET_EVENTS.ROUND_ITEM_STATUS, {
      sessionId: 's1',
      tableId: 't1',
      tableCode: 'O3',
      roundId: 'r1',
      itemId: 'i1',
      status: 'ready',
    });

    const cached = kitchenApi.endpoints.queue.select(undefined)(store.getState()).data;
    expect(cached?.tickets[0].items[0].status).toBe('ready');
  });

  it('ignores an item-status event for a ticket it does not hold', async () => {
    // A stale roundId must not throw and must not corrupt the board.
    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'staff' }));
    await store.dispatch(kitchenApi.util.upsertQueryData('queue', undefined, queue()));

    fakeSocket.fire(SOCKET_EVENTS.ROUND_ITEM_STATUS, {
      sessionId: 's1',
      tableId: 't1',
      tableCode: 'O3',
      roundId: 'does-not-exist',
      itemId: 'nope',
      status: 'ready',
    });

    const cached = kitchenApi.endpoints.queue.select(undefined)(store.getState()).data;
    expect(cached?.tickets[0].items[0].status).toBe('pending');
  });

  it("removes an 86'd item from the guest's menu rather than greying it out", async () => {
    const menu: MenuCategory[] = [
      {
        category: 'Our Special Tea',
        items: [
          {
            id: 'p1',
            productCode: '105',
            displayName: 'Plain Tea Cutting',
            description: '',
            price: 25,
            taxPercent: 5,
            imageUrl: '',
            kitchenStation: 'Beverage',
            isAvailable: true,
          },
          {
            id: 'p2',
            productCode: '128',
            displayName: 'Bun Maska Jam',
            description: '',
            price: 60,
            taxPercent: 5,
            imageUrl: '',
            kitchenStation: 'Kitchen',
            isAvailable: true,
          },
        ],
      },
    ];

    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'customer', tableCode: 'L5' }));
    await store.dispatch(customerApi.util.upsertQueryData('menu', 'L5', menu));

    fakeSocket.fire(SOCKET_EVENTS.PRODUCT_AVAILABILITY, {
      productCode: '105',
      displayName: 'Plain Tea Cutting',
      price: 25,
      isAvailable: false,
    });

    const cached = customerApi.endpoints.menu.select('L5')(store.getState()).data;
    const codes = cached?.[0].items.map((item) => item.productCode);
    expect(codes).toEqual(['128']);
  });

  it('survives an event with no payload instead of taking the app down', () => {
    // A malformed or empty broadcast must not throw inside the middleware —
    // an exception there kills every subsequent dispatch on the device.
    const store = makeStore();
    store.dispatch(socketConnectRequested({ mode: 'staff' }));

    expect(() => {
      fakeSocket.fire(SOCKET_EVENTS.ROUND_NEW, undefined);
      fakeSocket.fire(SOCKET_EVENTS.SESSION_OPENED, undefined);
      fakeSocket.fire(SOCKET_EVENTS.TABLE_STATUS, undefined);
    }).not.toThrow();
  });
});
