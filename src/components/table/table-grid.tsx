'use client';

import { useMemo } from 'react';

import type { LiveTableTile } from '@/lib/types';
import { groupBy } from '@/lib/utils';
import { TableGridCell } from './table-grid-cell';

/**
 * The floor, laid out by zone.
 *
 * Zones come from the data rather than being hardcoded, so adding a table on
 * the lawn is a Table Master edit and not a frontend change. Their *order* is
 * each zone's own display order, set on the admin Tables page: the server
 * sends tiles already sorted by it, and `groupBy` keeps first-seen order.
 */
export function TableGrid({ tiles }: { tiles: LiveTableTile[] }) {
  const zones = useMemo(
    () => Array.from(groupBy(tiles, (tile) => tile.zone || 'No zone').entries()),
    [tiles],
  );

  return (
    <div className="flex flex-col gap-6">
      {zones.map(([zone, zoneTiles]) => (
        <section key={zone} aria-label={`${zone} tables`}>
          <h2 className="text-ink-muted mb-2 text-sm font-semibold tracking-wide uppercase">
            {zone}
            <span className="ml-2 font-normal normal-case">
              {zoneTiles.filter((tile) => tile.status !== 'empty').length}/{zoneTiles.length} in use
            </span>
          </h2>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2.5">
            {[...zoneTiles]
              .sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code))
              .map((tile) => (
                <TableGridCell key={tile.tableId} tile={tile} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
