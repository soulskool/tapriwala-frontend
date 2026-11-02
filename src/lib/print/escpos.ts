/**
 * Text lines → ESC/POS bytes.
 *
 * ESC/POS is the thermal printer's own language — what the old SConnect POS
 * app speaks to the café's BPOS printer over Bluetooth, with no driver in
 * between. This is the handful of commands a bill and a KOT need, written out
 * by hand rather than pulled in as a dependency: init, bold, alignment, size,
 * feed and cut have been the same bytes on every ESC/POS printer for decades.
 *
 * Every line is clipped to the paper width before it is sent. A thermal
 * printer does not shrink a long line to fit — depending on the model it
 * either drops the overflow or wraps it onto a ragged second row — and both
 * are worse than a clean cut-off that the width tests already guard against.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** `ESC @` — reset the printer to its defaults. Sent first, every job. */
const INIT = [ESC, 0x40];

/**
 * `GS V 1` — partial cut.
 *
 * The plain one-byte form rather than `GS V 66 n` (feed-and-cut): it is the
 * variant cheap clones support most reliably, and the feed before it is sent
 * separately anyway.
 */
const PARTIAL_CUT = [GS, 0x56, 0x01];

export type PrintSize = 'normal' | 'tall' | 'double';
export type PrintAlign = 'left' | 'center';

/** A run of lines sharing one style. */
export interface PrintBlock {
  lines: string[];
  bold?: boolean;
  /**
   * `tall` doubles height only, so a 48-column grid still lines up.
   * `double` doubles both, which halves the characters per line.
   */
  size?: PrintSize;
  align?: PrintAlign;
  /**
   * A QR code printed after the lines, drawn by the printer itself from this
   * text (`GS ( k`). Sent as the printer's own QR command rather than as a
   * picture: a picture of a bill QR is ~20 KB, which over Bluetooth's 20-byte
   * writes is a thousand round trips and half a minute of waiting at the
   * counter; the command is the text plus a few bytes.
   */
  qr?: string;
}

export interface EncodeOptions {
  /** Characters per line at normal size: 48 for Font A on 80mm paper. */
  width: number;
  /** Blank lines fed before the cut, so the tear-off misses the text. */
  feedLines?: number;
  cut?: boolean;
}

/**
 * Dots per QR module by paper width: 6 on 80 mm (a bill QR is about 70
 * modules, so ~420 of the 576 dots — roughly 5 cm), 5 on 58 mm (~350 of 384).
 * Big enough to scan off creased paper from arm's length.
 */
export function qrModuleDots(width: number): number {
  return width >= 42 ? 6 : 5;
}

/** `GS ( k` for one QR: model 2, module size, error correction M, store, print. */
function qrCommand(text: string, moduleDots: number): number[] {
  // ASCII by construction (an EMV payload), but never let a stray byte
  // through as a command.
  const data = Array.from(toPrintableAscii(text), (char) => char.charCodeAt(0));
  const stored = data.length + 3;
  return [
    ...[GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00], // model 2
    ...[GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, moduleDots], // module size
    ...[GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31], // error correction M
    ...[GS, 0x28, 0x6b, stored & 0xff, stored >> 8, 0x31, 0x50, 0x30, ...data], // store
    ...[GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30], // print
    LF,
  ];
}

/** `GS ! n` — bit 0 doubles height, bit 4 doubles width. */
const SIZE_BYTE: Record<PrintSize, number> = { normal: 0x00, tall: 0x01, double: 0x11 };

/**
 * Plain ASCII, one byte per character.
 *
 * The printer's code page is not known and differs between models, so
 * anything outside printable ASCII is reduced to its base letter where it has
 * one ("Café" → "Cafe") and to `?` where it does not. A wrong glyph is
 * visible on paper; a wrong byte can be a command.
 */
export function toPrintableAscii(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/₹/g, 'Rs')
    .replace(/[^\x20-\x7e]/g, '?');
}

/** Characters that fit on one line at a given size. */
export function charsPerLine(width: number, size: PrintSize = 'normal'): number {
  return size === 'double' ? Math.floor(width / 2) : width;
}

export function encodeEscPos(blocks: PrintBlock[], options: EncodeOptions): Uint8Array {
  const { width, feedLines = 4, cut = true } = options;
  const bytes: number[] = [...INIT];

  for (const block of blocks) {
    const size = block.size ?? 'normal';
    bytes.push(ESC, 0x45, block.bold ? 1 : 0);
    bytes.push(ESC, 0x61, block.align === 'center' ? 1 : 0);
    bytes.push(GS, 0x21, SIZE_BYTE[size]);

    const limit = charsPerLine(width, size);
    for (const line of block.lines) {
      const text = toPrintableAscii(line).slice(0, limit);
      for (let index = 0; index < text.length; index += 1) bytes.push(text.charCodeAt(index));
      bytes.push(LF);
    }
    if (block.qr) bytes.push(...qrCommand(block.qr, qrModuleDots(width)));
  }

  // Back to defaults before the feed, so the blank lines are normal height.
  bytes.push(ESC, 0x45, 0, ESC, 0x61, 0, GS, 0x21, 0);
  // `ESC d n` — feed n lines.
  if (feedLines > 0) bytes.push(ESC, 0x64, feedLines);
  if (cut) bytes.push(...PARTIAL_CUT);

  return Uint8Array.from(bytes);
}
