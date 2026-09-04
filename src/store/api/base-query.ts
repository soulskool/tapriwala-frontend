import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query';

import { API_BASE_URL } from '@/lib/api-config';
import type { ApiEnvelope, ApiErrorEnvelope, FieldError, Paginated } from '@/lib/types';

/**
 * The one place the four role apps talk to Express.
 *
 * Every API slice in this folder builds on this, so auth, error translation
 * and envelope unwrapping are written once rather than nine times.
 */

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  /**
   * This *is* the auth mechanism.
   *
   * The staff session is an httpOnly cookie, so there is no `Authorization`
   * header to set and no token for this app to hold. `include` tells the
   * browser to attach that cookie; the backend must name this origin in
   * `CORS_ORIGINS`, because a wildcard is not permitted with credentials.
   *
   * Guest (QR) requests are simply unauthenticated — the token in their URL is
   * their identity, and the server pins them to one table.
   */
  credentials: 'include',
});

/**
 * Signalled when the API rejects our session.
 *
 * A plain DOM event rather than a slice import: `base-query` is imported by
 * every API slice, and having it import a slice that imports an API slice back
 * is the classic way to create a circular module graph that only fails in a
 * production build.
 */
export const AUTH_EXPIRED_EVENT = 'acd-cafe:auth-expired';

function announceAuthExpired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

/**
 * Adds the one cross-cutting behaviour fetchBaseQuery does not give us: a 401
 * anywhere means the shift's session died, and every screen should return to
 * the PIN pad rather than quietly rendering empty lists.
 */
export const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, api, extraOptions);

  // The guest flow has no session to expire, and its 401s ("invalid QR code")
  // mean a dead sticker, not a signed-out operator. Only staff calls sign out.
  const url = typeof args === 'string' ? args : args.url;
  if (result.error?.status === 401 && !url.startsWith('/public/')) {
    announceAuthExpired();
  }

  return result;
};

// ─── Envelope helpers ────────────────────────────────────────────────────────

/**
 * Unwraps `{ success, data }` down to `data`.
 *
 * Used as `transformResponse: unwrap<Thing>` so no component ever writes
 * `response.data.data`.
 */
export function unwrap<T>(response: ApiEnvelope<T>): T {
  return response.data;
}

/** Unwraps a paginated list into `{ items, pagination }`. */
export function unwrapPaginated<T>(response: ApiEnvelope<T[]>): Paginated<T> {
  return {
    items: response.data,
    pagination: response.meta?.pagination ?? {
      page: 1,
      limit: response.data.length,
      total: response.data.length,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };
}

// ─── Error helpers ───────────────────────────────────────────────────────────

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorEnvelope).error?.message === 'string'
  );
}

/**
 * The sentence to show a human.
 *
 * The backend already writes messages meant for staff ("Close the open session
 * on this table before deactivating it"), so the job here is to surface them
 * rather than replace them with "Something went wrong".
 */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!error || typeof error !== 'object') return fallback;

  const maybeFetchError = error as FetchBaseQueryError;

  if ('status' in maybeFetchError) {
    // The device is offline or the API is down — say which, because the fix
    // differs: one is the café's Wi-Fi, the other is the server.
    if (maybeFetchError.status === 'FETCH_ERROR') {
      return 'Cannot reach the server. Check the Wi-Fi and try again.';
    }
    if (maybeFetchError.status === 'TIMEOUT_ERROR') {
      return 'The server took too long to respond. Try again.';
    }
    if (isErrorEnvelope(maybeFetchError.data)) {
      return maybeFetchError.data.error.message;
    }
    if (maybeFetchError.status === 429) {
      return 'Too many attempts. Wait a moment and try again.';
    }
  }

  return fallback;
}

/**
 * Field-level validation errors, keyed by field name.
 *
 * `details` is always an array on the wire; the backend has a regression test
 * for exactly that, because an object here silently breaks form rendering.
 */
export function apiFieldErrors(error: unknown): Record<string, string> {
  if (!error || typeof error !== 'object' || !('data' in error)) return {};

  const data = (error as { data?: unknown }).data;
  if (!isErrorEnvelope(data) || !Array.isArray(data.error.details)) return {};

  return Object.fromEntries(
    data.error.details.map((detail: FieldError) => [detail.field, detail.message]),
  );
}

/** True when the failure is a lost connection rather than a rejected request. */
export function isOfflineError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as FetchBaseQueryError).status === 'FETCH_ERROR'
  );
}
