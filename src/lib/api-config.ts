/**
 * Where the API lives, and how the browser proves who it is.
 *
 * **The staff session is an httpOnly cookie set by the backend on login.**
 * This app never reads, stores or forwards a token — script on the page cannot
 * touch an httpOnly cookie, so an XSS bug cannot walk off with a shift's
 * session the way it could with a token in `localStorage`.
 *
 * That works because `SameSite` compares *sites*, not origins, and ignores the
 * port: `localhost:3000` → `localhost:5010` is same-site, and so is
 * `app.cafe.com` → `api.cafe.com`. Only genuinely different domains need
 * `COOKIE_SAMESITE=none` on the backend (which then requires HTTPS).
 *
 * Every request therefore carries `credentials: 'include'`, and the backend
 * must name this origin in `CORS_ORIGINS` — a wildcard is not allowed with
 * credentials.
 *
 * Guests carry no credential at all. The table code in their URL is the
 * whole of their identity, and the server pins each request to one table.
 */

/** REST base, including the version prefix: http://localhost:5010/api/v1 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5010/api/v1';

/** Socket.IO origin — the bare host, with no /api/v1 on it. */
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:5010';

/**
 * Cached copy of *who* is signed in — never the credential itself.
 *
 * Purely so a reloaded tab paints its own screen immediately instead of
 * flashing the PIN pad while `/auth/me` is in flight. The cookie is what
 * actually authorises anything; tampering with this only changes which
 * skeleton is drawn for a few hundred milliseconds.
 */
export const USER_CACHE_KEY = 'acd_cafe_user';

export function readCachedUser<T>(): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Private browsing with storage disabled — just means no instant paint.
    return null;
  }
}

export function writeCachedUser(user: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable — the in-memory copy carries this shift */
  }
}

export function clearCachedUser(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    /* nothing to clear */
  }
}
