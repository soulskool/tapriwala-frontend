<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# ACD Cafe frontend — project notes

Part of the ACD Cafe system. The workspace brief is `../CLAUDE.md`; read that
first, then `README.md` (how to run) and `ARCHITECTURE.md` (why it is shaped
this way).

Backend lives in `../backend` and must be running on :5010 for anything here to
work. There is no database and no API route in this app.

## Before committing

```bash
npm run check     # typecheck + lint + format:check
```

## Non-obvious rules

- `src/lib/constants.ts` mirrors `../backend/src/config/constants.ts`. Change
  one, change both.
- Tailwind v4 is configured in **CSS** — design tokens live in the `@theme`
  block of `src/app/globals.css`. Never write a raw hex in a component.
- All socket handling lives in `src/store/socket/socket-middleware.ts`. Nothing
  else may import `socket.io-client`.
- Live list queries (kitchen queue, live grid, request queue) are called with
  **no argument** and filtered in the browser, so the socket middleware has
  exactly one cache entry to patch.
- A cart's `idempotencyKey` rotates only _after_ the server acknowledges the
  round. Clearing it earlier breaks double-tap protection.
- The KDS splits, billing merges. Do not "fix" one to match the other.
- No `any`. Shared shapes live in `src/lib/types.ts`.
