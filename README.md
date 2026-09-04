# ACD Cafe — Frontend

Four role UIs in one Next.js app: the guest's phone, the waiter's phone, the
kitchen tablet and the counter PC. Talks to the Express + Socket.IO backend in
[`../backend`](../backend).

See [ARCHITECTURE.md](ARCHITECTURE.md) for why it is shaped this way.

---

## Run it

The backend must be running first — this app has no database of its own.

```bash
# terminal 1
cd ../backend && npm run dev          # http://localhost:5010

# terminal 2
cp .env.example .env.local            # then edit if your ports differ
npm install
npm run dev                           # http://localhost:3000
```

| Command             | Does                                                      |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Dev server (Turbopack)                                    |
| `npm run build`     | Production build                                          |
| `npm start`         | Serve the production build                                |
| `npm run typecheck` | `tsc --noEmit`                                            |
| `npm run lint`      | ESLint                                                    |
| `npm run format`    | Prettier write                                            |
| `npm run check`     | typecheck + lint + format check — run before every commit |

### Environment

`NEXT_PUBLIC_*` values are **inlined at build time**. Changing one means a
rebuild, not just a restart.

| Variable                    | Meaning                                              |
| --------------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`       | REST base, including `/api/v1`                       |
| `NEXT_PUBLIC_SOCKET_URL`    | Socket.IO origin — the bare host, no `/api/v1`       |
| `NEXT_PUBLIC_IMAGE_ORIGINS` | Comma-separated hosts `next/image` may optimise from |

The backend needs to agree: `CORS_ORIGINS` must include `http://localhost:3000`,
and `CUSTOMER_BASE_URL` must point here so printed QR codes resolve.

---

## The four screens

| Route                                            | Who                                    | Auth                                    |
| ------------------------------------------------ | -------------------------------------- | --------------------------------------- |
| `/order/<qrToken>`                               | guest, from the sticker on their table | none — the QR token _is_ the credential |
| `/waiter`, `/waiter/<tableId>`                   | waiter (+ billing)                     | PIN                                     |
| `/kitchen`                                       | kitchen                                | PIN                                     |
| `/billing`, `/billing/<sessionId>`               | billing                                | PIN                                     |
| `/admin`, `/admin/{products,tables,users,audit}` | admin                                  | PIN                                     |

`/login` is the PIN pad. `/` sends a signed-in operator to their own screen.

### How staff sign in

The session is an **httpOnly cookie** set by the backend on login. This app
never reads, stores or forwards a token — script on the page cannot touch an
httpOnly cookie, so an XSS bug cannot walk off with a shift's session.

Every request carries `credentials: 'include'`, and the Socket.IO handshake
carries `withCredentials: true`. "Am I signed in?" is answered by `/auth/me`,
not by anything in storage — which also catches an account deactivated
mid-shift.

`localStorage` holds one thing: a cached copy of _who_ is signed in, so a
reloaded tablet paints its own screen instead of flashing the PIN pad. It is
not a credential; tampering with it only changes which skeleton is drawn.

Guests carry nothing at all. The `qrToken` in their URL is their whole
identity.

Seeded logins are printed by the backend's `npm run seed`.

---

## Layout

```
src/
  app/
    (customer)/order/[qrToken]/   guest flow — server shell + client cart
    (waiter)/waiter/              floor grid, per-table ordering
    (kitchen)/kitchen/            the KDS board (dark, full-bleed)
    (billing)/billing/            queue + consolidation
    (admin)/admin/                overview, products, tables, users, audit
    login/                        PIN pad
    providers.tsx                 store, auth restore, toasts
    globals.css                   Tailwind v4 @theme design tokens
  components/
    ui/          generic, no business logic
    menu/  table/  kitchen/  billing/  waiter/  customer/  layout/
  store/
    api/         one createApi per domain
    slices/      cart, auth, ui
    socket/      socket-middleware.ts — the only file that touches a socket
  lib/           constants (mirrors the backend), types, utils
  hooks/         one responsibility each
```

Route groups (`(waiter)`, `(kitchen)`, …) each own a layout that declares the
roles it allows, so a screen cannot be added without deciding who may see it.

---

## Conventions

- **Files** kebab-case, **components** PascalCase, **one component per file**.
- **No `any`.** Shared shapes live in `src/lib/types.ts` and mirror the
  backend's response DTOs exactly.
- **Server Component by default.** `"use client"` only for state, effects,
  event handlers, RTK hooks, or the socket.
- **No business logic in JSX** — compute above the `return`, in a hook or a
  plain function.
- `src/lib/constants.ts` mirrors the backend's `src/config/constants.ts`.
  Change one, change both.

### Styling

Tailwind v4 is configured **in CSS**, not `tailwind.config.ts`. Design tokens
live in the `@theme` block of `src/app/globals.css`; `--color-status-ready`
there is what makes `bg-status-ready` exist. Never write a raw hex in a
component.

Every status carries a colour **and** an icon **and** a label. That is
deliberate: a colour-blind waiter has to read the floor as fast as anyone else.

---

## Data flow

```
Server Component  ──fetch──▶  initial HTML (customer menu)
       │
Client Component  ──RTK Query──▶  REST          ← the truth
       ▲                            │
       └──── socket-middleware ◀── Socket.IO    ← the notification
```

- **One `createApi` per domain** (`menuApi`, `sessionApi`, …) so tag
  invalidation stays scoped.
- **Sockets never carry state into components.** Every event lands in
  `store/socket/socket-middleware.ts` and becomes either a `updateQueryData`
  patch (cheap, known change) or an `invalidateTags` (structural change).
- **Live list queries are called with no argument** and filtered in the
  browser. One cache entry per list means the socket middleware always has
  exactly one thing to patch.
- **On reconnect, re-fetch.** `refetchOnReconnect` is on for the kitchen,
  billing and request queues. A tablet that dropped off the Wi-Fi re-reads the
  queue rather than replaying missed events.

### Ordering is idempotent

Every cart carries an `idempotencyKey`, generated once and rotated only after
the server acknowledges the round. A double-tapped button or a retry after
dropped Wi-Fi returns the original order instead of sending a second ticket to
the kitchen.

Carts persist to `localStorage`, so a guest who reloads mid-order on weak
veranda Wi-Fi does not lose their basket.

---

## Performance

- `React.memo` on `MenuItemCard`, `TableGridCell`, `KotTicketCard`,
  `StatusPill`, `ElapsedTimer` — these repaint on every socket tick.
- Search inputs debounce 200 ms before filtering.
- Optimistic updates on the taps that must feel instant: item status, the 86
  toggle, acknowledging a service request. They roll back on failure.
- `next/image` for every menu photo.
- The customer's menu is rendered on the **server**, so a guest sees the menu
  before any JS boots.

---

## Known gaps

- **No tests.** The backend has 212; this has none yet. Playwright against the
  seeded backend would be the highest-value first pass.
- **No offline queue.** A failed order tells the waiter loudly and keeps the
  cart; it does not retry in the background.
- **KDS board is not virtualised.** Fine for tens of tickets; measure before
  adding a library.
