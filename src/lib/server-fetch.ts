import { API_BASE_URL } from './api-config';
import type { ApiEnvelope } from './types';

/**
 * Server-side reads, for the initial paint of a page.
 *
 * The customer's first view of the menu should arrive as HTML — that page is
 * loaded on a guest's own phone, often on weak veranda Wi-Fi, and making them
 * download and boot a JS bundle before they can *see* a menu is the difference
 * between ordering and waving at a waiter.
 *
 * Only unauthenticated (QR) endpoints belong here: there is no staff token on
 * the server, and smuggling one through would be a real security problem.
 */
export async function fetchPublic<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      // A table's live order changes minute to minute; never serve it stale.
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;

    const envelope = (await response.json()) as ApiEnvelope<T>;
    return envelope.data;
  } catch {
    // The API being down must not crash the page — the client half re-fetches
    // and shows a real error with a retry.
    return null;
  }
}
