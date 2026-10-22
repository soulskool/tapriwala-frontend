import { describe, expect, it } from 'vitest';

import { encodeEscPos, toPrintableAscii } from '@/lib/print/escpos';
import { encodeJob } from '@/lib/print/print-jobs';
import { bytesToBase64, rawbtUrl } from '@/lib/print/rawbt';

import { FIXTURES, KOT_FIXTURES } from './print-fixtures';

/**
 * The bytes that go straight to the printer.
 *
 * A wrong byte here is not a cosmetic bug: ESC/POS is a command stream, and a
 * stray control character can cut, feed or switch code page mid-bill. These
 * tests pin the framing (init first, cut last), the styles that carry meaning
 * (bold throughout, NET TOTAL double-size) and the paper width.
 */

const ESC = 0x1b;
const GS = 0x1d;

/** The printable lines in a job, with every command sequence stripped. */
function textLines(bytes: Uint8Array): string[] {
  const out: string[] = [];
  let current = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index]!;
    if (byte === ESC || byte === GS) {
      // Every command this encoder emits is 3 bytes (`ESC @` is 2).
      index += bytes[index + 1] === 0x40 ? 1 : 2;
      continue;
    }
    if (byte === 0x0a) {
      out.push(current);
      current = '';
      continue;
    }
    current += String.fromCharCode(byte);
  }
  return out;
}

/** Index of a byte sequence, or -1. */
function indexOfSeq(bytes: Uint8Array, seq: number[]): number {
  outer: for (let index = 0; index <= bytes.length - seq.length; index += 1) {
    for (let offset = 0; offset < seq.length; offset += 1) {
      if (bytes[index + offset] !== seq[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

describe('encodeEscPos', () => {
  it('starts with init and ends with feed + partial cut', () => {
    const bytes = encodeEscPos([{ lines: ['HELLO'] }], { width: 48 });
    expect([...bytes.slice(0, 2)]).toEqual([ESC, 0x40]);
    expect([...bytes.slice(-6)]).toEqual([ESC, 0x64, 4, GS, 0x56, 0x01]);
  });

  it('clips a line to the paper rather than letting the printer wrap it', () => {
    const bytes = encodeEscPos([{ lines: ['X'.repeat(60)] }], { width: 48 });
    expect(textLines(bytes)[0]).toBe('X'.repeat(48));
  });

  it('clips a double-size line to half the width', () => {
    const bytes = encodeEscPos([{ lines: ['Y'.repeat(30)], size: 'double' }], { width: 48 });
    expect(textLines(bytes)[0]).toBe('Y'.repeat(24));
    expect(indexOfSeq(bytes, [GS, 0x21, 0x11])).toBeGreaterThan(-1);
  });

  it('never sends a non-ASCII byte', () => {
    expect(toPrintableAscii('Café Crème ₹50 ☕')).toBe('Cafe Creme Rs50 ?');
    const bytes = encodeEscPos([{ lines: ['Masala chai ☕ — 2'] }], { width: 48 });
    expect([...bytes].every((byte) => byte < 0x80)).toBe(true);
  });
});

describe('a bill as ESC/POS', () => {
  const bytes = encodeJob({ kind: 'receipt', receipt: FIXTURES.live }, 48);
  const lines = textLines(bytes);

  it('prints the same receipt text as the 48-column builder, plus NET TOTAL', () => {
    expect(lines).toContain('TABLE   : O3');
    expect(lines).toContain('BILL NO : 1234');
    expect(lines.find((line) => line.startsWith('TW CUTT TEA'))).toHaveLength(48);
  });

  it('prints NET TOTAL double size, right-aligned in the half-width line', () => {
    const total = lines.find((line) => line.startsWith('NET TOTAL'));
    expect(total).toBe(`NET TOTAL${'262'.padStart(24 - 9)}`);
    const totalAt = indexOfSeq(bytes, [...new TextEncoder().encode('NET TOTAL')]);
    // The size command for this line sits just before it.
    expect(indexOfSeq(bytes.slice(totalAt - 9, totalAt), [GS, 0x21, 0x11])).toBeGreaterThan(-1);
  });

  it('prints bold, as the old POS app was set up to', () => {
    expect(indexOfSeq(bytes, [ESC, 0x45, 1])).toBeGreaterThan(-1);
  });

  it('keeps every line within 48 characters (24 for the double-size total)', () => {
    for (const line of lines) {
      const limit = line.startsWith('NET TOTAL') ? 24 : 48;
      expect(line.length, `overflows: "${line}"`).toBeLessThanOrEqual(limit);
    }
  });

  it('marks a reprint DUPLICATE on the direct path too', () => {
    const reprint = textLines(encodeJob({ kind: 'receipt', receipt: FIXTURES.reprintMixed }, 48));
    expect(reprint.some((line) => line.includes('DUPLICATE BILL'))).toBe(true);
  });
});

describe('a KOT as ESC/POS', () => {
  it('prints the ticket double height, with no prices on it', () => {
    const bytes = encodeJob({ kind: 'kot', kot: KOT_FIXTURES.addOn! }, 48);
    const lines = textLines(bytes);
    expect(indexOfSeq(bytes, [GS, 0x21, 0x01])).toBeGreaterThan(-1);
    expect(lines).toContain('KOT     : 1051');
    expect(lines.join('\n')).not.toMatch(/\d+\.\d\d/);
    // Cancelled items are left off, as on paper today.
    expect(lines.join('\n')).not.toContain('Veg Sandwich');
  });
});

describe('RawBT hand-off', () => {
  it('wraps the job in RawBT’s intent URL as base64', () => {
    const bytes = Uint8Array.from([ESC, 0x40, 0x41, 0x0a, 0xff]);
    expect(bytesToBase64(bytes)).toBe(btoa(String.fromCharCode(...bytes)));
    expect(rawbtUrl(bytes)).toBe(
      `intent:base64,${bytesToBase64(bytes)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`,
    );
  });

  it('round-trips a whole bill through base64 unchanged', () => {
    const bytes = encodeJob({ kind: 'receipt', receipt: FIXTURES.reprintMixed }, 48);
    const encoded = rawbtUrl(bytes).slice('intent:base64,'.length).split('#')[0]!;
    const decoded = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    expect([...decoded]).toEqual([...bytes]);
  });
});
