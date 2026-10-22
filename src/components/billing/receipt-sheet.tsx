import { ORDER_TYPE, ORDER_TYPE_LABEL, type OrderType } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';

/**
 * The 80mm thermal receipt.
 *
 * Hidden on screen and revealed only by `@media print` (see `globals.css`),
 * which is why it is a plain Server Component with no state: printing it is
 * `window.print()` on the page that already has the bill. A device set to
 * print directly (Bluetooth / RawBT — see `lib/print/`) skips this sheet and
 * sends `buildReceiptText` at the printer's own width instead.
 *
 * **Whether this is a tax invoice is decided by one env var.** Set
 * `NEXT_PUBLIC_SHOP_GSTIN` and the header prints the GSTIN and the paper calls
 * itself a TAX INVOICE; leave it unset and it stays a plain customer copy.
 *
 * The two are deliberately tied together, because the failure mode is asymmetric:
 * a receipt that says "TAX INVOICE" without a GSTIN on it is worse than useless
 * to the guest, and a GSTIN printed on something that will not admit to being an
 * invoice helps nobody either. One switch, both consequences.
 *
 * The reason it shipped without a GSTIN was that the café's own billing software
 * issued the GST bill for the same sale, and two invoice numbers against one
 * payment is a filing problem, not a cosmetic one. That software is no longer in
 * the loop — this portal issues the only bill — so the reason is spent. **If the
 * old POS is ever put back in front of the same sale, unset the GSTIN again.**
 *
 * Monospace and box-drawn on purpose: a thermal printer renders a fixed-width
 * column perfectly and proportional type badly.
 */

/** Shop identity. Env-driven so a second outlet needs no code change. */
const SHOP = {
  name: process.env.NEXT_PUBLIC_SHOP_NAME ?? 'TAPRIWALA BY TREATMEETS',
  addressLine1: process.env.NEXT_PUBLIC_SHOP_ADDRESS_1 ?? '',
  addressLine2: process.env.NEXT_PUBLIC_SHOP_ADDRESS_2 ?? '',
  phone: process.env.NEXT_PUBLIC_SHOP_PHONE ?? '',
  /** Set this and the paper becomes a tax invoice. See the note above. */
  gstin: process.env.NEXT_PUBLIC_SHOP_GSTIN ?? '',
  footer: process.env.NEXT_PUBLIC_SHOP_FOOTER ?? 'THANK YOU ! VISIT AGAIN',
};

/**
 * Receipt columns are counted in characters, not pixels.
 *
 * 32 is a hard limit for the HTML sheet: one character over and the printer
 * runs the line off the edge of the roll — it does not wrap or shrink to fit,
 * it simply stops, and you find out on paper in front of a guest. Every row
 * below is built from the column grid so the header can never drift out of
 * step with the rows.
 *
 * The matching half of this contract is the print font size in `globals.css`,
 * which is derived from this number and the roll width. Changing 32 without
 * redoing that arithmetic prints a truncated bill.
 *
 * The direct-to-printer path (Bluetooth / RawBT, `lib/print/`) asks for a
 * wider sheet — 48 characters is Font A across 80mm — and gets the same
 * builder at that width. The 32-column sheet is what the Windows counter
 * prints through the browser, and it stays exactly what it was.
 */
export const RECEIPT_WIDTH = 32;

interface ReceiptGrid {
  width: number;
  item: { name: number; qty: number; rate: number; amount: number };
  tax: { rate: number; taxable: number; cgst: number; sgst: number };
}

/**
 * The column grid for a given paper width.
 *
 * 32 is the historical grid, frozen character for character. Anything wider
 * gives the extra room to the numbers first — at 32 a ₹8080 rate on a
 * five-figure line runs its columns together — and the rest to the name.
 */
function gridFor(width: number): ReceiptGrid {
  if (width <= RECEIPT_WIDTH) {
    return {
      width,
      item: { name: 14, qty: 3, rate: 7, amount: 8 },
      tax: { rate: 6, taxable: 10, cgst: 8, sgst: 8 },
    };
  }
  return {
    width,
    item: { name: width - 24, qty: 5, rate: 9, amount: 10 },
    tax: { rate: width - 36, taxable: 12, cgst: 12, sgst: 12 },
  };
}

function rule(grid: ReceiptGrid, char = '-'): string {
  return char.repeat(grid.width);
}

/** Lays one item row (or the header) into the fixed column grid. */
function itemRow(
  grid: ReceiptGrid,
  name: string,
  qty: string,
  rate: string,
  amount: string,
): string {
  const columns = grid.item;
  return (
    name.slice(0, columns.name).padEnd(columns.name) +
    qty.padStart(columns.qty) +
    rate.padStart(columns.rate) +
    amount.padStart(columns.amount)
  );
}

/** The tax-summary grid at the foot of the receipt. The full paper width. */
function taxRow(
  grid: ReceiptGrid,
  rate: string,
  taxable: string,
  cgst: string,
  sgst: string,
): string {
  const columns = grid.tax;
  return (
    rate.padEnd(columns.rate) +
    taxable.padStart(columns.taxable) +
    cgst.padStart(columns.cgst) +
    sgst.padStart(columns.sgst)
  );
}

/** Centres a line without letting a long one push past the paper edge. */
function centre(grid: ReceiptGrid, text: string): string {
  const trimmed = text.slice(0, grid.width);
  return ' '.repeat(Math.max(0, Math.floor((grid.width - trimmed.length) / 2))) + trimmed;
}

/** Right-aligns money in a fixed column so the decimal points line up. */
function money(amount: number): string {
  return amount.toFixed(2);
}

/**
 * The NET TOTAL figure: whole rupees print as "452", not "452.00".
 *
 * Bills are rounded to the rupee, so the paise are always zero and the owner
 * wants them off the paper. A bill saved before rounding began was charged in
 * paise and reprints them, because that is what the guest paid.
 */
function netTotal(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : money(amount);
}

/** Money with its sign always shown — a round off can go either way. */
function signedMoney(amount: number): string {
  return `${amount < 0 ? '-' : '+'}${Math.abs(amount).toFixed(2)}`;
}

/**
 * The least a receipt needs.
 *
 * Deliberately structural rather than `ConsolidatedBill`: the same paper has to
 * print from a live table (a consolidation, still changing) and from a saved
 * `BillingExport` months later (frozen, and with no session number stored on
 * it). Both satisfy this shape, so neither needs converting into the other.
 */
export interface ReceiptData {
  tableCode: string;
  /** Absent when reprinting a stored bill — the export does not keep it. */
  sessionNumber?: number | null;
  /**
   * Every type on the bill, dining first.
   *
   * Optional because a `BillingExport` frozen before this field existed has no
   * summary on it — such a bill was all dining, and is rendered from its lines
   * instead. Present on every live consolidation.
   */
  orderTypes?: OrderType[];
  lines: {
    posName: string;
    quantity: number;
    unitPrice: number;
    taxPercent: number;
    amount: number;
    taxAmount: number;
    /** Absent on bills frozen before the field existed — those were dining. */
    orderType?: OrderType;
  }[];
  subtotal: number;
  tax: number;
  /**
   * total − (subtotal + tax). Optional because a bill saved before rounding
   * has none; zero or absent prints no line at all.
   */
  roundOff?: number;
  total: number;
}

export interface ReceiptSheetProps {
  bill: ReceiptData;
  /** Present once the bill has been generated; absent while it is a preview. */
  billNumber?: number | undefined;
  printedAt: string;
  /** Stamps "DUPLICATE" — a reprint must be distinguishable from the original. */
  isReprint?: boolean;
}

/** One receipt as text, split where the HTML sheet changes element. */
export interface ReceiptText {
  /** Shop header down to the totals block, `\n`-separated. */
  body: string;
  /** The NET TOTAL figure alone — set larger than the grid on both paths. */
  netTotal: string;
  /** Tax summary and footer, `\n`-separated. */
  foot: string;
}

/**
 * Builds the receipt as text at a given paper width.
 *
 * Pulled out of the JSX so the browser sheet and the direct-to-printer bytes
 * (`lib/print/`) are the same characters from one code path — at 32 columns
 * this is exactly what the HTML sheet has always rendered, which is pinned by
 * `tests/print-golden.json`.
 */
export function buildReceiptText(
  { bill, billNumber, printedAt, isReprint }: ReceiptSheetProps,
  width: number = RECEIPT_WIDTH,
): ReceiptText {
  const grid = gridFor(width);

  // One row per tax rate, matching how the café's own POS prints it. Grouped
  // rather than assumed to be a single 5% because the item sheet genuinely
  // contains more than one rate.
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const line of bill.lines) {
    const entry = byRate.get(line.taxPercent) ?? { taxable: 0, tax: 0 };
    entry.taxable += line.amount;
    entry.tax += line.taxAmount;
    byRate.set(line.taxPercent, entry);
  }
  const rates = [...byRate.entries()].sort(([a], [b]) => a - b);

  /*
   * Which types this paper covers.
   *
   * Falls back to reading the lines when the summary is absent, so a bill
   * saved before order types existed reprints as DINING rather than with a
   * blank heading.
   */
  const types =
    bill.orderTypes && bill.orderTypes.length > 0
      ? bill.orderTypes
      : [...new Set(bill.lines.map((line) => line.orderType ?? ORDER_TYPE.DINING))];

  /*
   * A mixed bill marks each line rather than trusting the heading.
   *
   * One heading over a bill that is half parcel is worse than none: the guest
   * reads it, believes it covers everything, and queries the bill at the
   * counter. The marker is a leading `*` and not a word because the name
   * column is 14 characters wide and a word would eat half of it.
   */
  const isMixed = types.length > 1;

  const head = [
    centre(grid, SHOP.name.toUpperCase()),
    centre(grid, SHOP.addressLine1),
    centre(grid, SHOP.addressLine2),
    SHOP.phone ? centre(grid, `PH: ${SHOP.phone}`) : '',
    SHOP.gstin ? centre(grid, `GSTIN : ${SHOP.gstin}`) : '',
    '',
    // A reprint must always announce itself, whichever kind of paper it
    // is — the guest and the counter both need to know this is a second
    // copy of one sale, not a second sale.
    centre(grid, isReprint ? 'DUPLICATE BILL' : SHOP.gstin ? 'TAX INVOICE' : 'CUSTOMER COPY'),
    isReprint && SHOP.gstin ? centre(grid, 'TAX INVOICE') : '',
    rule(grid, '='),
    `TABLE   : ${bill.tableCode}`,
    `TYPE    : ${types.map((type) => ORDER_TYPE_LABEL[type].toUpperCase()).join(' + ')}`,
    bill.sessionNumber ? `SESSION : ${bill.sessionNumber}` : '',
    billNumber ? `BILL NO : ${billNumber}` : 'BILL NO : (not generated)',
    `DATE    : ${formatDateTime(printedAt)}`,
    rule(grid),
    itemRow(grid, 'ITEM', 'QTY', 'RATE', 'TOTAL'),
    rule(grid),
  ].filter((row) => row.trim() !== '');

  const items = bill.lines.map((line) =>
    // The POS name, not the pretty menu name: this is the line the
    // counter has to reconcile against the software's own bill.
    itemRow(
      grid,
      isMixed && (line.orderType ?? ORDER_TYPE.DINING) === ORDER_TYPE.PARCEL
        ? `*${line.posName}`
        : line.posName,
      String(line.quantity),
      money(line.unitPrice),
      money(line.amount),
    ),
  );

  const totals = [
    // The key for the per-line marker, printed only when there is one.
    ...(isMixed ? [`* = ${ORDER_TYPE_LABEL[ORDER_TYPE.PARCEL].toUpperCase()}`] : []),
    rule(grid),
    `SUBTOTAL${money(bill.subtotal).padStart(width - 8)}`,
    `TAX  (+)${money(bill.tax).padStart(width - 8)}`,
    // Signed, so SUBTOTAL + TAX + ROUND OFF visibly equals NET TOTAL.
    // Left off entirely when there is none, as on every old bill.
    ...(bill.roundOff ? [`ROUND OFF${signedMoney(bill.roundOff).padStart(width - 9)}`] : []),
    rule(grid, '='),
  ];

  const foot = [
    rule(grid),
    taxRow(grid, 'TAX%', 'TAXABLE', 'CGST', 'SGST'),
    ...rates.map(([rate, { taxable, tax }]) =>
      // Half to CGST, half to SGST — the same split the café's own POS
      // prints, so the two receipts read alike when a guest holds both.
      taxRow(grid, money(rate), money(taxable), money(tax / 2), money(tax / 2)),
    ),
    rule(grid),
    '',
    centre(grid, SHOP.footer),
  ];

  return {
    // Three joins glued with newlines, exactly as the sheet's three JSX
    // children were — an empty bill keeps its blank line.
    body: `${head.join('\n')}\n${items.join('\n')}\n${totals.join('\n')}`,
    // Whole rupees, no ".00" — see `netTotal`.
    netTotal: netTotal(bill.total),
    foot: foot.join('\n'),
  };
}

export function ReceiptSheet(props: ReceiptSheetProps) {
  const text = buildReceiptText(props);

  return (
    <div className="receipt-sheet" aria-hidden>
      <pre className="receipt-body">{text.body}</pre>

      <p className="receipt-total">
        <span>NET TOTAL</span>
        <span>{text.netTotal}</span>
      </p>

      <pre className="receipt-body">{text.foot}</pre>
    </div>
  );
}
