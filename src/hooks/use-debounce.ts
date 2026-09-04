'use client';

import { useEffect, useState } from 'react';

import { UI_THRESHOLDS } from '@/lib/constants';

/**
 * Delays a fast-changing value.
 *
 * Used on the item search inputs: filtering the whole product list on every
 * keystroke is visible jank on a mid-range Android phone once the menu grows
 * past a few dozen items.
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number = UI_THRESHOLDS.SEARCH_DEBOUNCE_MS,
): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
