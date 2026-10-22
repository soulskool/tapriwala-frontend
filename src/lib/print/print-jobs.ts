import { buildReceiptText, type ReceiptSheetProps } from '@/components/billing/receipt-sheet';
import { buildKotText, type KotData } from '@/components/kitchen/kot-sheet';
import { formatDateTime } from '@/lib/utils';

import { charsPerLine, encodeEscPos, type PrintBlock } from './escpos';

/**
 * What a Print button asks for — the same data its HTML sheet renders from.
 *
 * Kept structural, so the direct path needs nothing the screen has not
 * already fetched: the receipt and KOT text come from the very builders the
 * sheets use, at the printer's width instead of the sheet's 32.
 */
export type PrintJob =
  | { kind: 'receipt'; receipt: ReceiptSheetProps }
  | { kind: 'kot'; kot: KotData }
  | { kind: 'test'; modeLabel: string; printedAt: string };

const lines = (text: string): string[] => text.split('\n');

/**
 * The bill.
 *
 * All bold, as the HTML sheet is and as the old POS app was set up ("bold
 * on") — a thermal head prints regular weight grey. NET TOTAL is the one line
 * printed double size, the ESC/POS equivalent of the larger figure on the
 * HTML sheet; at double width only half the columns fit, so it is laid out
 * against that narrower line.
 */
export function receiptBlocks(receipt: ReceiptSheetProps, width: number): PrintBlock[] {
  const text = buildReceiptText(receipt, width);
  const totalWidth = charsPerLine(width, 'double');
  return [
    { lines: lines(text.body), bold: true },
    {
      lines: [`NET TOTAL${text.netTotal.padStart(totalWidth - 'NET TOTAL'.length)}`],
      bold: true,
      size: 'double',
    },
    { lines: lines(text.foot), bold: true },
  ];
}

/**
 * The kitchen ticket.
 *
 * Double *height* throughout: the HTML KOT is already set larger than the bill
 * because it is read at arm's length across a hot kitchen. Height alone keeps
 * the full column grid, so the quantities still line up on the right.
 */
export function kotBlocks(kot: KotData, width: number): PrintBlock[] {
  return [{ lines: lines(buildKotText(kot, width)), bold: true, size: 'tall' }];
}

/**
 * A test page for the Printer screen.
 *
 * The ruler is the point: if its last digit is missing on paper, the printer
 * holds fewer characters per line than chosen, and the owner picks the next
 * width down instead of discovering it on a guest's bill.
 */
export function testBlocks(modeLabel: string, printedAt: string, width: number): PrintBlock[] {
  const ruler = Array.from({ length: width }, (_, index) => String((index + 1) % 10)).join('');
  return [
    { lines: ['TEST PRINT', modeLabel], bold: true, size: 'double', align: 'center' },
    {
      lines: [
        '',
        `${width} characters per line:`,
        ruler,
        '-'.repeat(width),
        'If the last digit above is cut off,',
        'choose a smaller width on the',
        'Printer screen.',
        '',
        formatDateTime(printedAt),
      ],
      bold: true,
    },
  ];
}

export function encodeJob(job: PrintJob, width: number): Uint8Array {
  const blocks =
    job.kind === 'receipt'
      ? receiptBlocks(job.receipt, width)
      : job.kind === 'kot'
        ? kotBlocks(job.kot, width)
        : testBlocks(job.modeLabel, job.printedAt, width);
  return encodeEscPos(blocks, { width });
}
