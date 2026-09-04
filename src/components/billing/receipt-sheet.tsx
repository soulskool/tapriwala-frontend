import type { ConsolidatedBill } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

/**
 * The 80mm thermal receipt.
 *
 * Hidden on screen and revealed only by `@media print` (see `globals.css`),
 * which is why it is a plain Server Component with no state: printing it is
 * `window.print()` on the page that already has the bill.
 *
 * **This is a customer copy, not a tax invoice.** The GST invoice is still
 * issued by the café's billing software, so nothing here carries the GSTIN or
 * the words "TAX INVOICE" — two systems printing a tax invoice for one sale
 * would mean two invoice numbers against one payment, which is a real problem
 * at filing time rather than a cosmetic one. The tax split is still shown,
 * because the guest is paying it either way and hiding it helps nobody.
 *
 * Monospace and box-drawn on purpose: a thermal printer renders a fixed-width
 * column perfectly and proportional type badly.
 */

/** Shop identity. Env-driven so a second outlet needs no code change. */
const SHOP = {
  name: process.env.NEXT_PUBLIC_SHOP_NAME ?? 'TAPRIWALA',
  addressLine1: process.env.NEXT_PUBLIC_SHOP_ADDRESS_1 ?? '',
  addressLine2: process.env.NEXT_PUBLIC_SHOP_ADDRESS_2 ?? '',
  phone: process.env.NEXT_PUBLIC_SHOP_PHONE ?? '',
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

export interface ReceiptSheetProps {
  bill: ConsolidatedBill;
  /** Present once the bill has been generated; absent while it is a preview. */
  billNumber?: string | undefined;
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

  return (
    <div className="receipt-sheet" aria-hidden>
      <pre className="receipt-body">
        {[
          centre(SHOP.name.toUpperCase()),
          centre(SHOP.addressLine1),
          centre(SHOP.addressLine2),
          SHOP.phone ? centre(`PH: ${SHOP.phone}`) : '',
          '',
          centre(isReprint ? 'DUPLICATE - CUSTOMER COPY' : 'CUSTOMER COPY'),
          rule('='),
          `TABLE   : ${bill.tableCode}`,
          `SESSION : ${bill.sessionNumber}`,
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
            itemRow(line.posName, String(line.quantity), money(line.unitPrice), money(line.amount)),
          )
          .join('\n')}
        {'\n'}
        {[
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
          centre('Not a tax invoice.'),
          centre('GST bill is issued'),
          centre('at the counter.'),
          '',
          centre(SHOP.footer),
        ].join('\n')}
      </pre>
    </div>
  );
}
