/**
 * Handing a print job to the RawBT Android app.
 *
 * RawBT (Play Store, `ru.a402d.rawbtprinter`) owns the printer connection —
 * Classic Bluetooth, BLE or a USB-OTG cable — which is exactly what a web page
 * cannot do with a Classic-only printer. The page only has to give it the
 * bytes.
 *
 * The format is RawBT's `intent:` URL with the ESC/POS job as base64:
 *
 *     intent:base64,<data>#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;
 *
 * Taken from the RawBT connector in mike42/escpos-php (`RawbtPrintConnector`),
 * which builds exactly this string. rawbt.ru documents the same scheme on its
 * "Integration with other android application" page. Naming the package means
 * Chrome opens the Play Store listing when RawBT is not installed, instead of
 * failing silently.
 *
 * Navigation to an app link only works from a user gesture, so this must be
 * called synchronously inside the tap handler — no `await` before it.
 */

export const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter';

/** Bytes → base64, without `Buffer` (browser only) and without chunk limits. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

export function rawbtUrl(bytes: Uint8Array): string {
  return `intent:base64,${bytesToBase64(bytes)}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`;
}

/** Opens RawBT with the job. Call from a tap handler, with nothing awaited first. */
export function sendToRawbt(bytes: Uint8Array): void {
  window.location.href = rawbtUrl(bytes);
}

/** A hint, not a gate: RawBT exists only on Android, but the owner may still pick it. */
export function isProbablyAndroid(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}
