'use client';

import { memo } from 'react';

import { OrderTypePill } from '@/components/ui/order-type-pill';
import type { ConsolidatedLine } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';

interface ConsolidatedLineItemProps {
  line: ConsolidatedLine;
  /** Cancelled lines are shown struck through, for scrutiny, never billed. */
  cancelled?: boolean;
  /**
   * The bill has both dining and parcel lines.
   *
   * The badge is only drawn then. On a bill that is entirely one or the other
   * — nearly all of them — repeating "Dining" down every row is noise that
   * makes the one bill where it matters harder to read, not easier.
   */
  showOrderType?: boolean;
}

/**
 * One line of the consolidated bill.
 *
 * `productCode` is first and set in a monospace face on purpose: this is the
 * exact string the legacy POS expects, and the whole point of the screen is
 * that a biller reads a code and a quantity instead of searching by name.
 */
function ConsolidatedLineItemComponent({
  line,
  cancelled = false,
  showOrderType = false,
}: ConsolidatedLineItemProps) {
  return (
    <tr className={cn('border-line border-b', cancelled && 'opacity-55')}>
      <td className="px-3 py-2.5">
        <span className="bg-surface-sunken rounded px-1.5 py-0.5 font-mono text-sm font-bold">
          {line.productCode}
        </span>
      </td>

      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={cn('font-medium', cancelled && 'line-through')}>{line.posName}</p>
          {showOrderType ? <OrderTypePill orderType={line.orderType} size="sm" /> : null}
        </div>
        <p className="text-ink-muted text-sm">
          {line.displayName}
          {/* Which rounds this quantity came from — the drill-down staff need
              when a guest queries a line. */}
          {line.rounds.length > 0 ? (
            <span className="ml-1.5">· rounds {line.rounds.join(', ')}</span>
          ) : null}
        </p>
      </td>

      <td className="px-3 py-2.5 text-right text-lg font-bold tabular-nums">{line.quantity}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(line.unitPrice)}</td>
      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
        {formatCurrency(line.amount)}
      </td>
    </tr>
  );
}

export const ConsolidatedLineItem = memo(ConsolidatedLineItemComponent);
