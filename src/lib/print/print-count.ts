/**
 * How many times each bill has been printed on this device.
 *
 * The second print of a bill must say DUPLICATE. That count used to live in
 * the bill page's component state, which the checkout modal cannot see — so a
 * bill printed from the page and again from the modal (or from the counter's
 * list) would have come out as two originals. One module-level map is shared
 * by every screen instead.
 *
 * Keyed by bill number, so a draft printed before the number existed is not
 * what makes the first numbered print a duplicate. Memory only, like the state
 * it replaces: a reload starts the count again.
 */
const counts = new Map<string, number>();

/** The key for a bill, or for a table's unnumbered draft. */
export function printKey(sessionId: string, billNumber: number | undefined): string {
  return billNumber ? `bill:${billNumber}` : `draft:${sessionId}`;
}

/** Records one print and returns how many there have now been (1 = original). */
export function countPrint(key: string): number {
  const next = (counts.get(key) ?? 0) + 1;
  counts.set(key, next);
  return next;
}

/** How many prints there have been so far, without recording one. */
export function peekPrintCount(key: string): number {
  return counts.get(key) ?? 0;
}
