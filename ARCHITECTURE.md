# ACD Cafe Frontend — Architecture & Design

Why the frontend is shaped the way it is. The [README](README.md) covers how to
run it; this covers the decisions, so the next change fits the grain instead of
fighting it.

The backend's own [ARCHITECTURE.md](../backend/ARCHITECTURE.md) is the companion
to this document and explains the data model these screens render.

---

## 1. One app, four users who are not alike

| Screen         | Device                         | Held how                                      | Design consequence              |
| -------------- | ------------------------------ | --------------------------------------------- | ------------------------------- |
| Guest ordering | the guest's own phone          | one hand, possibly weak Wi-Fi                 | first paint must not wait on JS |
| Waiter         | shared Android phone           | one hand, three plates in the other           | 44 px touch targets, no typing  |
| Kitchen (KDS)  | one mounted tablet             | tapped with a knuckle, read across a hot room | dark, huge type, no chrome      |
| Billing        | counter PC, keyboard and mouse | seated, guest waiting                         | dense tables, printable         |

These are four different products sharing one contract. The folder groups
(`(customer)`, `(waiter)`, `(kitchen)`, `(billing)`, `(admin)`) exist so that
stays true — kitchen code never reaches a guest's phone.

---

## 2. Server vs Client Components

Default is Server Component. `"use client"` is added only for state, effects,
event handlers, RTK hooks, or the socket.

In practice only one page has a meaningful server half:

| Page               | Server                                    | Client                              |
| ------------------ | ----------------------------------------- | ----------------------------------- |
| `/order/[qrToken]` | table + menu fetched and rendered as HTML | cart, live status, service requests |
| everything else    | a thin shell                              | the whole screen                    |

That asymmetry is the honest answer, not a compromise. A guest's first view of
the menu is their first interaction with the café's system, often on veranda
Wi-Fi, and it should arrive as HTML. A kitchen board, by contrast, is 100% live
data — server-rendering it would produce markup that is stale before it paints.

`src/lib/server-fetch.ts` is deliberately limited to the tokenless QR endpoints.
There is no staff token on the server, and smuggling one there would be a real
security problem, not a convenience.

---

## 3. State: who owns what

```
server owns  →  RTK Query cache  →  components read it
client owns  →  cartSlice        →  the only genuinely local state
device owns  →  authSlice, uiSlice
```

A cart is the one thing that does not exist server-side until "Place Order" is
tapped, which is why it is the only real slice. Everything else the server
already owns, so caching it in a slice would just create a second truth to keep
in sync.

**One `createApi` per domain**, not one giant slice. Tag invalidation stays
scoped and each file stays short. The cost is that tags do not cross API
boundaries — placing an order cannot directly invalidate the kitchen queue. That
turns out not to matter, because the socket does it (§4), and the socket is the
more honest trigger anyway: the kitchen queue changes when the _server_ says it
changed, not when this device happens to have caused it.

### Carts are keyed by scope

`carts: Record<scope, Cart>` — the scope is the `qrToken` on a guest's phone and
the `tableId` on a waiter's. A waiter walking the floor can hold a half-built
order for M2 while opening R4. A single global cart would be unusable in service.

---

## 4. Realtime, in exactly one file

`src/store/socket/socket-middleware.ts` is the only module that imports
`socket.io-client`. Every event lands there and becomes a cache effect:

| Event kind                     | Effect                  | Why                                                                                               |
| ------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------- |
| an item ticked to Ready        | `updateQueryData` patch | highest-frequency event in the system; no round-trip                                              |
| a new round, a session closing | `invalidateTags`        | structural — cheaper to re-read than to reconstruct                                               |
| the 86 toggle                  | patch **both** menus    | broadcast to every device in the café; a fleet-wide re-fetch would be a self-inflicted load spike |

> **Sockets notify. REST tells the truth.**

`refetchOnReconnect` is on for every live queue. A kitchen tablet that dropped
off the Wi-Fi for two minutes re-reads `GET /kitchen/queue` rather than replaying
missed events. A lost ticket is a lost sale; a redundant fetch is nothing.

### Why live queries take no argument

Every patched query — the kitchen queue, the live grid, the request queue — is
called with `undefined` and filtered in the browser. RTK Query keys its cache by
argument, so a station filter baked into the query key would create a second
cache entry the middleware does not know about, and one of them would silently
go stale. One entry per list, one thing to patch. Filtering client-side is also
instant, which is what you want on a mounted tablet.

---

## 5. The status vocabulary

Defined once, in two places that must agree:

- `src/lib/constants.ts` — mirrors the backend's `config/constants.ts`.
- the `@theme` block of `globals.css` — every status colour, as a token.

`TILE_STATUS_STYLE` and `ITEM_STATUS_STYLE` in `components/ui/status-pill.tsx`
join them. Every status renders as **colour + icon + label**, never colour
alone — §5 of the plan requires a colour-blind waiter to read the floor as fast
as anyone else, and "green means ready" fails that.

Tailwind v4 is configured in CSS, not `tailwind.config.ts`. A `--color-*` entry
in `@theme` is what makes `bg-status-ready` exist at all.

---

## 6. Two views over the same data

The frontend inherits the backend's most important rule and must not "fix" it:

> **The KDS splits. Billing merges.**

Two teas ordered an hour apart are two cards on the kitchen board, each with its
own timer, because they are two cooking jobs. The same two teas are one line on
the bill. `SessionRounds` never merges; `ConsolidatedLineItem` only ever renders
what the server already merged. Making one match the other would break a real
workflow.

---

## 7. Failure is a first-class state

A waiter walking away from a table believing an order went through when it did
not is the worst thing this system can do. So:

- **Success toasts auto-dismiss; error toasts do not.** They stay until read.
- The order failure message is blunt — "Order NOT sent — try again".
- `ConnectionDot` is in every header. If the socket is down the screen is stale,
  and staff should know that before trusting a tile.
- `apiErrorMessage` surfaces the backend's own sentence ("Close the open session
  on this table before deactivating it") rather than replacing it with
  "Something went wrong". The backend writes those messages for staff.
- A 401 anywhere dispatches one app-wide event, so every screen returns to the
  PIN pad together instead of quietly rendering empty lists.

### Idempotency is a UI concern, not just an API one

Each cart carries a key generated once and rotated **only after** the server
acknowledges the round. Double-tap, retry, dropped Wi-Fi — same key, same round,
one ticket. Clearing the cart before the response would break this, which is why
`markSubmitted()` is called after `unwrap()` and never before.

---

## 8. Trust boundaries

The client-side `AuthGuard` is **UX, not security**. Every endpoint behind it
re-checks the role server-side. Hiding a button the API would refuse anyway is a
courtesy.

The guest flow has no token at all. The `qrToken` in the URL is the credential,
and the server pins each request — and each socket — to exactly one table before
any handler runs. A guest at M2 cannot read or write another table, and cannot
join another table's socket room even by asking. The frontend does not police
this, and should not try to.

### The staff session is an httpOnly cookie

Set by the backend on login, attached by the browser, never visible to this
app. That is the point: script on the page cannot read an httpOnly cookie, so
an XSS bug cannot exfiltrate a shift's session the way it could a token in
`localStorage`.

This works because **`SameSite` compares sites, not origins, and ignores the
port**: `localhost:3000` → `localhost:5010` is same-site, and so is
`app.cafe.com` → `api.cafe.com`. Only genuinely different domains need
`COOKIE_SAMESITE=none` on the backend, which then requires HTTPS (the backend
refuses to boot with `none` outside production for exactly that reason).

Two consequences worth knowing before touching this:

1. **`/auth/me` is the session check.** There is no token to inspect, so
   `AuthGuard` asks the server. Strictly better than trusting storage — it also
   catches an account deactivated mid-shift.
2. **Socket.IO's default transport order is load-bearing.** The cookie rides
   along with the _polling_ handshake, so forcing `transports: ['websocket']`
   authenticates staff as anonymous and the server refuses the connection.
   There is a comment in `socket-middleware.ts` saying so.

---

## 9. Performance, and where it actually matters

| Technique                      | Applied to                                                                     | Because                                                 |
| ------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Server rendering               | the guest's menu                                                               | first paint on café Wi-Fi                               |
| `React.memo`                   | `MenuItemCard`, `TableGridCell`, `KotTicketCard`, `StatusPill`, `ElapsedTimer` | these repaint on every socket tick across a whole board |
| Debounce (200 ms)              | item search                                                                    | visible jank on a mid-range Android once the menu grows |
| Optimistic updates             | item status, 86 toggle, acknowledging a request                                | a cook tapping Ready should see it in the same frame    |
| `updateQueryData` over refetch | item ticks, availability                                                       | a busy kitchen must not re-fetch the board on every tap |
| Route groups                   | all four apps                                                                  | kitchen code never ships to a guest's phone             |

`useElapsedMinutes` derives its value at render and uses an interval purely to
force a re-render. Holding the number in state would mean the first paint is
computed once and then corrected — and a ticket must never flash "just now" when
it is twenty minutes old.

Deliberately **not** done: virtualising the KDS board or the product list. A
café's board holds tens of cards, not thousands. Measure first.

---

## 10. Where to change things

| To change…                         | Touch                                                | Nothing else moves because…                    |
| ---------------------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| A status colour                    | the `@theme` block in `globals.css`                  | every screen reads the token                   |
| What a socket event does to the UI | `store/socket/socket-middleware.ts`                  | it is the only file that touches a socket      |
| Add an endpoint                    | the matching `store/api/*.ts`                        | components only ever see the hook              |
| POS export method                  | `EXPORT_METHOD` passed in `consolidation-client.tsx` | the server already computed and froze the bill |
| Split the KDS by station           | it is already a filter in `kds-board-client.tsx`     | `kitchenStation` is on every item              |
| Who may see a screen               | the route group's `layout.tsx`                       | each group declares its own allowed roles      |
| Move the staff token to a cookie   | `lib/api-config.ts`                                  | nothing else reads storage                     |

---

## 11. Known gaps

- **No tests.** Playwright against the seeded backend is the highest-value
  first pass — the flows worth covering are: place an order twice with the same
  key, 86 an item and watch it vanish from a guest's phone, and close a session
  held for review.
- **No offline queue.** A failed order keeps the cart and shouts; it does not
  retry in the background.
- **No image resizing on upload** — that gap lives in the backend, but it is
  felt here: a 3 MB phone photo is served to a phone on café Wi-Fi.
- **`localStorage` carts are never garbage-collected.** They are tiny, but a
  device that serves a hundred tables accumulates a hundred keys.
- **No error boundary per route group.** A render crash in one panel takes the
  screen with it.
