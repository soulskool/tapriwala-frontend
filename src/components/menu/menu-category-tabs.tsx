'use client';

import { memo } from 'react';

import { cn } from '@/lib/utils';

interface MenuCategoryTabsProps {
  categories: string[];
  active: string;
  onChange: (category: string) => void;
  /** Item counts per category, so a guest can see where the food is. */
  counts?: Record<string, number>;
}

/**
 * The category chip bar.
 *
 * These are jump links, not tabs. Every category is rendered on the page at
 * once — with 21 of them, hiding twenty behind a tab meant a guest had to know
 * "Vada Pav" was a category before they could find a vada pav. Tapping a chip
 * scrolls to that section; scrolling the page moves the highlight back.
 *
 * `aria-current` rather than `aria-selected`: this is navigation within one
 * document, and calling it a tablist would promise screen-reader users that
 * only one panel exists at a time, which is no longer true.
 */
function MenuCategoryTabsComponent({
  categories,
  active,
  onChange,
  counts,
}: MenuCategoryTabsProps) {
  return (
    <div
      aria-label="Jump to category"
      role="navigation"
      className="no-scrollbar bg-surface/95 -mx-4 flex gap-2 overflow-x-auto px-4 py-2 backdrop-blur"
    >
      {categories.map((category) => {
        const selected = category === active;
        return (
          <button
            key={category}
            type="button"
            aria-current={selected ? 'true' : undefined}
            onClick={() => onChange(category)}
            className={cn(
              'min-h-touch shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition',
              selected
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-line bg-surface text-ink-muted hover:border-brand-300 hover:text-ink',
            )}
          >
            {category}
            {counts?.[category] ? (
              <span className={cn('ml-1.5 tabular-nums', selected ? 'opacity-80' : 'opacity-60')}>
                {counts[category]}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export const MenuCategoryTabs = memo(MenuCategoryTabsComponent);
