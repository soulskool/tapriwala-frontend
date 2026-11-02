import { qrcodegen } from './vendor/qrcodegen';

/**
 * The "Scan & Pay" QR printed under a bill's total.
 *
 * The café's HDFC SmartHub standee QR, exactly as HDFC issued it, with the
 * bill's amount written into it. It is an EMV "Bharat QR" payload, not a
 * `upi://` link: a list of `tag · length · value` fields closed by a CRC.
 * Everything HDFC put in it is kept — the UPI ID, the terminal, the reference
 * the SmartHub app reconciles on — so a bill paid this way lands in the same
 * account and shows in the same Vyapar app as a standee payment. Only three
 * things change:
 *
 * - tag 01 goes from `11` (static: the payer types an amount) to `12`
 *   (dynamic: one payment, amount fixed),
 * - tag 54, the transaction amount, is added,
 * - tag 63, the CRC, is recomputed over the new text.
 *
 * The source is checked against its own CRC before anything is built. A
 * mistyped digit would otherwise be sealed under a fresh, valid CRC and
 * print a QR that scans cleanly and pays somewhere wrong — so a source that
 * fails the check prints no QR at all.
 *
 * Override with `NEXT_PUBLIC_SHOP_UPI_QR` (the scanned text of a new standee)
 * if the café ever changes bank account.
 */
export const SHOP_UPI_QR =
  process.env.NEXT_PUBLIC_SHOP_UPI_QR ??
  '000201010211021644038436885798020416522024036885798806166100030368857986' +
    '0825HDFC00000015020012002757726460010A0000005240128vyapar.178423020978@hdfcbank' +
    '27420010A0000005240124STQD541571817864354707575204581253033565802IN' +
    '5911TREAT MEETS6008TIRUPATI610651750162400524STQD54157181786435470757' +
    '070836885798630473b4';

interface Field {
  tag: string;
  value: string;
}

/** CRC-16/CCITT-FALSE, upper-case hex — what EMV QR tag 63 holds. */
export function emvCrc(text: string): string {
  let crc = 0xffff;
  for (let index = 0; index < text.length; index += 1) {
    crc ^= text.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Top-level fields, or null if the text is not well-formed TLV. */
function parseFields(text: string): Field[] | null {
  const fields: Field[] = [];
  let index = 0;
  while (index < text.length) {
    const head = text.slice(index, index + 4);
    if (!/^\d{4}$/.test(head)) return null;
    const length = Number(head.slice(2));
    const value = text.slice(index + 4, index + 4 + length);
    if (value.length !== length) return null;
    fields.push({ tag: head.slice(0, 2), value });
    index += 4 + length;
  }
  return fields;
}

const field = ({ tag, value }: Field): string =>
  `${tag}${String(value.length).padStart(2, '0')}${value}`;

/** True when the text is well-formed and its last field is a matching CRC. */
export function isValidEmvQr(text: string): boolean {
  const fields = parseFields(text);
  const last = fields?.at(-1);
  if (!fields || last?.tag !== '63') return false;
  return emvCrc(text.slice(0, -4)) === last.value.toUpperCase();
}

/**
 * The source QR with `amount` (rupees) filled in, or null when no QR should
 * print: a source that fails its CRC, or nothing to pay.
 */
export function upiQrForAmount(amount: number, source: string = SHOP_UPI_QR): string | null {
  if (!Number.isFinite(amount) || amount <= 0 || !isValidEmvQr(source)) return null;

  const kept = (parseFields(source) ?? []).filter(
    ({ tag }) => tag !== '54' && tag !== '63' && tag !== '01',
  );
  const added: Field[] = [
    { tag: '01', value: '12' },
    { tag: '54', value: amount.toFixed(2) },
  ];
  // Fields stay in ascending tag order, as the spec lists them.
  const fields = [...kept, ...added].sort((a, b) => Number(a.tag) - Number(b.tag));

  const body = `${fields.map(field).join('')}6304`;
  return `${body}${emvCrc(body)}`;
}

/**
 * Which QR a bill carries — set per device on the Printer screen.
 *
 * - `amount`: the bill's total is written into the QR; the guest only taps Pay.
 * - `standee`: the standee QR exactly as HDFC issued it; the guest types the
 *   amount (the line under it says how much).
 * - `off`: no QR, the bill prints as it always did.
 */
export type UpiQrMode = 'off' | 'amount' | 'standee';

/** What a receipt needs to decide whether it carries a QR, and which. */
export interface ReceiptQrInput {
  bill: { total: number };
  /** Already paid: a pay QR on that paper only invites a second payment. */
  settled?: boolean | undefined;
}

/** The payload a receipt prints, or null for none. */
export function receiptUpiQr(receipt: ReceiptQrInput, mode: UpiQrMode): string | null {
  if (mode === 'off' || receipt.settled) return null;
  const { total } = receipt.bill;
  if (!Number.isFinite(total) || total <= 0) return null;
  if (mode === 'standee') return isValidEmvQr(SHOP_UPI_QR) ? SHOP_UPI_QR : null;
  return upiQrForAmount(total);
}

/**
 * The QR's dark modules, row by row, for drawing it as a picture.
 *
 * Error correction M (15%): a thermal print smudges and creases, and L left
 * too little margin, while Q or H would push the symbol to a size that no
 * longer fits a 58 mm roll comfortably.
 */
export function qrModules(payload: string): boolean[][] {
  const code = qrcodegen.QrCode.encodeText(payload, qrcodegen.QrCode.Ecc.MEDIUM);
  return Array.from({ length: code.size }, (_, y) =>
    Array.from({ length: code.size }, (_, x) => code.getModule(x, y)),
  );
}
