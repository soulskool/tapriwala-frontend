import { ORDER_TYPE, ORDER_TYPE_LABEL, type OrderType } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';

/**
 * The 80mm thermal receipt.
 *
 * Hidden on screen and revealed only by `@media print` (see `globals.css`),
 * which is why it is a plain Server Component with no state: printing it is
 * `window.print()` on the page that already has the bill.
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
 * 32 is what a 72mm printable width fits at 10.5pt in a monospace face, and it
 * is a hard limit: one character over and the printer wraps the line, which
 * turns a tidy column of prices into two ragged ones. Every row below is built
 * from ITEM_COLUMNS so the header can never drift out of step with the rows.
 */
const WIDTH = 32;

const ITEM_COLUMNS = { name: 14, qty: 3, rate: 7, amount: 8 } as const;

function rule(char = '-'): string {
  return char.repeat(WIDTH);
}

/** Lays one item row (or the header) into the fixed column grid. */
function itemRow(name: string, qty: string, rate: string, amount: string): string {
  return (
    name.slice(0, ITEM_COLUMNS.name).padEnd(ITEM_COLUMNS.name) +
    qty.padStart(ITEM_COLUMNS.qty) +
    rate.padStart(ITEM_COLUMNS.rate) +
    amount.padStart(ITEM_COLUMNS.amount)
  );
}

/** The tax-summary grid at the foot of the receipt. Also 32 characters wide. */
function taxRow(rate: string, taxable: string, cgst: string, sgst: string): string {
  return rate.padEnd(6) + taxable.padStart(10) + cgst.padStart(8) + sgst.padStart(8);
}

/** Centres a line without letting a long one push past the paper edge. */
function centre(text: string): string {
  const trimmed = text.slice(0, WIDTH);
  return ' '.repeat(Math.max(0, Math.floor((WIDTH - trimmed.length) / 2))) + trimmed;
}

/** Right-aligns money in a fixed column so the decimal points line up. */
function money(amount: number): string {
  return amount.toFixed(2);
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

export function ReceiptSheet({ bill, billNumber, printedAt, isReprint }: ReceiptSheetProps) {
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

  return (
    <div className="receipt-sheet" aria-hidden>
      <pre className="receipt-body">
        {[
          centre(SHOP.name.toUpperCase()),
          centre(SHOP.addressLine1),
          centre(SHOP.addressLine2),
          SHOP.phone ? centre(`PH: ${SHOP.phone}`) : '',
          SHOP.gstin ? centre(`GSTIN : ${SHOP.gstin}`) : '',
          '',
          // A reprint must always announce itself, whichever kind of paper it
          // is — the guest and the counter both need to know this is a second
          // copy of one sale, not a second sale.
          centre(isReprint ? 'DUPLICATE BILL' : SHOP.gstin ? 'TAX INVOICE' : 'CUSTOMER COPY'),
          isReprint && SHOP.gstin ? centre('TAX INVOICE') : '',
          rule('='),
          `TABLE   : ${bill.tableCode}`,
          `TYPE    : ${types.map((type) => ORDER_TYPE_LABEL[type].toUpperCase()).join(' + ')}`,
          bill.sessionNumber ? `SESSION : ${bill.sessionNumber}` : '',
          billNumber ? `BILL NO : ${billNumber}` : 'BILL NO : (not generated)',
          `DATE    : ${formatDateTime(printedAt)}`,
          rule(),
          itemRow('ITEM', 'QTY', 'RATE', 'TOTAL'),
          rule(),
        ]
          .filter((row) => row.trim() !== '')
          .join('\n')}
        {'\n'}
        {bill.lines
          .map((line) =>
            // The POS name, not the pretty menu name: this is the line the
            // counter has to reconcile against the software's own bill.
            itemRow(
              isMixed && (line.orderType ?? ORDER_TYPE.DINING) === ORDER_TYPE.PARCEL
                ? `*${line.posName}`
                : line.posName,
              String(line.quantity),
              money(line.unitPrice),
              money(line.amount),
            ),
          )
          .join('\n')}
        {'\n'}
        {[
          // The key for the per-line marker, printed only when there is one.
          ...(isMixed ? [`* = ${ORDER_TYPE_LABEL[ORDER_TYPE.PARCEL].toUpperCase()}`] : []),
          rule(),
          `SUBTOTAL${money(bill.subtotal).padStart(WIDTH - 8)}`,
          `TAX  (+)${money(bill.tax).padStart(WIDTH - 8)}`,
          rule('='),
        ].join('\n')}
      </pre>

      <p className="receipt-total">
        <span>NET TOTAL</span>
        <span>{money(bill.total)}</span>
      </p>

      <pre className="receipt-body">
        {[
          rule(),
          taxRow('TAX%', 'TAXABLE', 'CGST', 'SGST'),
          ...rates.map(([rate, { taxable, tax }]) =>
            // Half to CGST, half to SGST — the same split the café's own POS
            // prints, so the two receipts read alike when a guest holds both.
            taxRow(money(rate), money(taxable), money(tax / 2), money(tax / 2)),
          ),
          rule(),
          '',
          centre(SHOP.footer),
        ].join('\n')}
      </pre>
    </div>
  );
}
