import {
  buildReceiptText,
  scanAndPay,
  type ReceiptSheetProps,
} from '@/components/billing/receipt-sheet';
import { buildKotText, type KotData } from '@/components/kitchen/kot-sheet';
import { formatDateTime } from '@/lib/utils';

import { charsPerLine, encodeEscPos, type PrintBlock } from './escpos';
import { isValidEmvQr, receiptUpiQr, SHOP_UPI_QR, type UpiQrMode } from './upi-qr';

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
export function receiptBlocks(
  receipt: ReceiptSheetProps,
  width: number,
  mode: UpiQrMode = 'off',
): PrintBlock[] {
  const text = buildReceiptText(receipt, width);
  const upiQr = receiptUpiQr(receipt, mode);
  const totalWidth = charsPerLine(width, 'double');
  const blocks: PrintBlock[] = [
    { lines: lines(text.body), bold: true },
    {
      lines: [`NET TOTAL${text.netTotal.padStart(totalWidth - 'NET TOTAL'.length)}`],
      bold: true,
      size: 'double',
    },
  ];
  if (!upiQr) return [...blocks, { lines: lines(text.foot), bold: true }];

  // The QR sits between the tax table and the closing "thank you" line,
  // which is always the foot's last line.
  const foot = lines(text.foot);
  const thanks = foot.pop() ?? '';
  return [
    ...blocks,
    { lines: foot, bold: true },
    { lines: [], qr: upiQr, align: 'center' },
    { lines: [scanAndPay(text.netTotal, mode), ''], bold: true, align: 'center' },
    { lines: [thanks], bold: true },
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
export function testBlocks(
  modeLabel: string,
  printedAt: string,
  width: number,
  upiQr = false,
): PrintBlock[] {
  const ruler = Array.from({ length: width }, (_, index) => String((index + 1) % 10)).join('');
  // The standee QR itself, no amount: proves this printer can draw a QR
  // before a guest's bill depends on it.
  const qr: PrintBlock[] =
    upiQr && isValidEmvQr(SHOP_UPI_QR)
      ? [
          { lines: [''], qr: SHOP_UPI_QR, align: 'center' },
          {
            lines: ['UPI QR test: scan it with GPay.', 'It should show TREAT MEETS.'],
            bold: true,
            align: 'center',
          },
        ]
      : [];
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
    ...qr,
  ];
}

export interface EncodeJobOptions {
  /** This device's UPI QR choice (Printer screen). Default off. */
  upiQr?: UpiQrMode;
}

export function encodeJob(
  job: PrintJob,
  width: number,
  { upiQr = 'off' }: EncodeJobOptions = {},
): Uint8Array {
  const blocks =
    job.kind === 'receipt'
      ? receiptBlocks(job.receipt, width, upiQr)
      : job.kind === 'kot'
        ? kotBlocks(job.kot, width)
        : testBlocks(job.modeLabel, job.printedAt, width, upiQr !== 'off');
  return encodeEscPos(blocks, { width });
}
