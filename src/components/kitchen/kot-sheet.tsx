import { ITEM_STATUS, ORDER_TYPE_LABEL, type ItemStatus, type OrderType } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';

/**
 * The kitchen ticket, as paper.
 *
 * Deliberately NOT the bill. A KOT carries what a cook has to act on — what,
 * how many, and any note — and nothing else. There are no prices on it and
 * there must never be: the number a chef reads off this sheet is a quantity,
 * and putting a rupee figure in the same column is how "2" gets cooked as
 * "30". The money lives on `ReceiptSheet`, one screen away, for the counter.
 *
 * Monospace and box-drawn for the same reason the receipt is: a thermal
 * printer renders a fixed-width column perfectly and proportional type badly.
 * Both sheets are hidden on screen and revealed only by `@media print`, so the
 * on-screen preview in the modal renders the very same string this prints.
 */

/**
 * 32 characters, matching the receipt — same 80mm roll, same printer.
 *
 * A hard limit, not a target: one character over and the printer wraps the
 * line, which turns a tidy column of quantities into two ragged ones.
 */
const WIDTH = 32;

/** Name takes what is left after the quantity column, plus one space of gutter. */
const QTY_COLUMN = 5;
const NAME_COLUMN = WIDTH - QTY_COLUMN;

function rule(char = '-'): string {
  return char.repeat(WIDTH);
}

function centre(text: string): string {
  const trimmed = text.slice(0, WIDTH);
  return ' '.repeat(Math.max(0, Math.floor((WIDTH - trimmed.length) / 2))) + trimmed;
}

/** Splits a long dish name across lines instead of letting the printer truncate it. */
function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    // A single word longer than the column is hard-split — rare, but a 40
    // character name must not silently lose its tail.
    if (word.length > width) {
      if (current) lines.push(current);
      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }
      current = lines.pop() ?? '';
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

/**
 * One item: name wrapped in its column, quantity right-aligned on the first row.
 *
 * Continuation rows are indented two spaces and carry no quantity, so a name
 * long enough to wrap cannot be read as two dishes — which on a kitchen docket
 * would mean cooking a plate that was never ordered. Nothing is padded on the
 * right: trailing spaces buy no alignment on a monospace roll and some
 * printers advance on them.
 */
function itemRows(name: string, quantity: number): string[] {
  const [first, ...rest] = wrap(name, NAME_COLUMN - 1);
  return [
    (first ?? '').padEnd(NAME_COLUMN) + String(quantity).padStart(QTY_COLUMN),
    ...rest.map((line) => `  ${line}`),
  ];
}

/** The least a kitchen ticket needs. Structural, so a round and a KDS ticket both fit. */
export interface KotData {
  kotId: string;
  tableCode: string;
  orderType: OrderType;
  roundNumber: number;
  /** Round 2 and up is an add-on to a table already eating — say so loudly. */
  isAddOn: boolean;
  placedAt: string;
  /** Who sent it. Blank on a round placed from a guest's own phone. */
  placedByName: string;
  items: {
    displayName: string;
    quantity: number;
    specialInstructions: string;
    status: ItemStatus;
  }[];
}

/**
 * Builds the printable ticket as one string.
 *
 * Exported separately from the component so the modal preview and the printed
 * sheet are literally the same characters — a preview that renders through a
 * different code path is a preview that can lie.
 */
export function buildKotText(kot: KotData): string {
  /*
   * Cancelled items are left off the list on purpose.
   *
   * This sheet is an instruction to cook. A cancelled line printed among the
   * live ones is an instruction to cook something the guest is not paying for,
   * and a chef reading paper across a hot kitchen will not catch a subtle
   * strike-through. The count is still stated at the foot, so a cancellation
   * is never silent — it just is not in the list of things to make.
   */
  const live = kot.items.filter((item) => item.status !== ITEM_STATUS.CANCELLED);
  const cancelledCount = kot.items.length - live.length;
  const totalQuantity = live.reduce((sum, item) => sum + item.quantity, 0);

  const lines: string[] = [
    rule('='),
    centre(`*** ${ORDER_TYPE_LABEL[kot.orderType].toUpperCase()} ***`),
    rule('='),
    // An add-on goes above the fold: the kitchen has to know this is extra
    // work for a table already eating, not a fresh cover.
    ...(kot.isAddOn ? [centre(`ADD-ON  ROUND ${kot.roundNumber}`), rule()] : []),
    `KOT     : ${kot.kotId}`,
    `TABLE   : ${kot.tableCode}`,
    `TIME    : ${formatDateTime(kot.placedAt)}`,
    ...(kot.placedByName ? [`SERVER  : ${kot.placedByName}`] : []),
    rule(),
    'ITEM'.padEnd(NAME_COLUMN) + 'QTY'.padStart(QTY_COLUMN),
    rule(),
  ];

  for (const item of live) {
    lines.push(...itemRows(item.displayName, item.quantity));
    // Notes are indented and marked so they can never read as another dish.
    if (item.specialInstructions) {
      lines.push(
        ...wrap(`* ${item.specialInstructions}`, NAME_COLUMN - 2).map((note) => `  ${note}`),
      );
    }
  }

  lines.push(
    rule(),
    'TOTAL ITEMS'.padEnd(NAME_COLUMN) + String(totalQuantity).padStart(QTY_COLUMN),
  );

  if (cancelledCount > 0) {
    lines.push(rule(), centre(`${cancelledCount} ITEM(S) CANCELLED`));
  }

  lines.push(rule('='));
  return lines.join('\n');
}

/**
 * The print-only copy.
 *
 * Rendered as a sibling of the modal rather than inside it: a native `<dialog>`
 * opened with `showModal()` lives in the browser's top layer, and printing from
 * the top layer is inconsistent across browsers. Keeping the paper outside the
 * dialog sidesteps that entirely — the same trick `ReceiptSheet` uses.
 */
export function KotSheet({ kot }: { kot: KotData }) {
  return (
    <div className="kot-sheet" aria-hidden>
      <pre className="kot-body">{buildKotText(kot)}</pre>
    </div>
  );
}
