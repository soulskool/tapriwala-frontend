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
}

export interface EncodeOptions {
  /** Characters per line at normal size: 48 for Font A on 80mm paper. */
  width: number;
  /** Blank lines fed before the cut, so the tear-off misses the text. */
  feedLines?: number;
  cut?: boolean;
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
  }

  // Back to defaults before the feed, so the blank lines are normal height.
  bytes.push(ESC, 0x45, 0, ESC, 0x61, 0, GS, 0x21, 0);
  // `ESC d n` — feed n lines.
  if (feedLines > 0) bytes.push(ESC, 0x64, feedLines);
  if (cut) bytes.push(...PARTIAL_CUT);

  return Uint8Array.from(bytes);
}
