'use client';

import { useMemo } from 'react';

import { ZONE_DISPLAY_ORDER, type TableZone } from '@/lib/constants';
import type { LiveTableTile } from '@/lib/types';
import { groupBy } from '@/lib/utils';
import { TableGridCell } from './table-grid-cell';

/**
 * The floor, laid out by zone.
 *
 * Zones come from the data rather than being hardcoded, so adding a table on
 * the lawn is a Table Master edit and not a frontend change. Their *order* is
 * fixed in `ZONE_DISPLAY_ORDER` because the grid should read the way the café
 * is actually arranged, and alphabetical does not.
 */
export function TableGrid({ tiles }: { tiles: LiveTableTile[] }) {
  const zones = useMemo(() => {
    const grouped = groupBy(tiles, (tile) => tile.zone as TableZone);

    return Array.from(grouped.entries()).sort(([a], [b]) => {
      const orderA = ZONE_DISPLAY_ORDER.indexOf(a);
      const orderB = ZONE_DISPLAY_ORDER.indexOf(b);
      // A zone nobody planned for sorts last rather than jumping to the front.
      return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB);
    });
  }, [tiles]);

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
