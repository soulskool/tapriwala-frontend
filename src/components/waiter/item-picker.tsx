'use client';

import { IconSearch } from '@/components/ui/icons';
import { useMemo, useState } from 'react';

import { MenuCategoryTabs } from '@/components/menu/menu-category-tabs';
import { MenuItemCard } from '@/components/menu/menu-item-card';
import { EmptyState } from '@/components/ui/feedback';
import { useDebouncedValue } from '@/hooks/use-debounce';
import type { MenuCategory, MenuItem } from '@/lib/types';

interface ItemPickerProps {
  menu: MenuCategory[];
  quantityOf: (productCode: string) => number;
  onAdd: (item: MenuItem) => void;
  onSetQuantity: (item: MenuItem, quantity: number) => void;
}

/**
 * The waiter's item picker.
 *
 * Same cards as the guest sees, with one deliberate difference: 86'd items are
 * shown greyed out rather than hidden. A waiter standing at a table needs to
 * be able to say "the sandwiches are finished" — silently removing the row
 * would leave them looking for something that is not there.
 */
export function ItemPicker({ menu, quantityOf, onAdd, onSetQuantity }: ItemPickerProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const categories = useMemo(() => menu.map((group) => group.category), [menu]);
  const [activeCategory, setActiveCategory] = useState(categories[0] ?? '');

  const items = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (term) {
      return menu
        .flatMap((group) => group.items)
        .filter(
          (item) =>
            item.displayName.toLowerCase().includes(term) ||
            // Staff often know an item by its POS code faster than its name.
            item.productCode.toLowerCase().includes(term),
        );
    }
    return menu.find((group) => group.category === activeCategory)?.items ?? [];
  }, [menu, debouncedSearch, activeCategory]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name or code"
        aria-label="Search the menu"
        className="min-h-touch border-line bg-surface w-full rounded-xl border px-4 text-base"
      />

      {!debouncedSearch.trim() ? (
        <MenuCategoryTabs
          categories={categories}
          active={activeCategory}
          onChange={setActiveCategory}
        />
      ) : null}

      {items.length === 0 ? (
        <EmptyState icon={<IconSearch />} title="No items match" />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              quantity={quantityOf(item.productCode)}
              onAdd={onAdd}
              onSetQuantity={onSetQuantity}
              showUnavailable
            />
          ))}
        </ul>
      )}
    </div>
  );
}
