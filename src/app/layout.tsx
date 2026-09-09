import type { Metadata, Viewport } from 'next';

import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Tapriwala by Treatmeets',
    template: '%s · Tapriwala by Treatmeets',
  },
  description: 'Real-time ordering, kitchen display and billing for Tapriwala by Treatmeets.',
  // The tab icon is `src/app/icon.jpeg` — a file-convention Next picks up on
  // its own, which is why there is no `icons` key here. It is a copy of
  // `public/icon.jpeg`, the 225px Tapriwala mark, at 7 KB.
  //
  // Exactly one `icon.*` may live in `app/`: Next takes multiple icons from
  // numbered suffixes (`icon1`, `icon2`), so a second file with a different
  // extension is ambiguous rather than additive. Replacing the logo means
  // replacing this file, not adding beside it.
  //
  // `apple-icon.jpeg` beside it is a SEPARATE Next convention, not a second
  // `icon.*` — it is what emits `<link rel="apple-touch-icon">`. Without it
  // Safari probes `/apple-touch-icon.png` and `-precomposed.png` at the site
  // root and logs two 404s no other browser generates. Keep the two files in
  // step; deleting this one looks like de-duplication and is a regression.
  //
  // The previous mark was a 256px PNG rendered down from an SVG, because that
  // SVG is 5 MB (the artwork is an embedded photo) and no tab is worth 5 MB on
  // café Wi-Fi. The same rule applies to whatever replaces this: keep the tab
  // icon a small raster, not the source artwork.
  // The customer flow is reached by scanning a sticker on a table; there is
  // nothing here for a search engine to index.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#a15c23',
  width: 'device-width',
  initialScale: 1,
  // Guests and staff both use this one-handed on a phone; let them zoom.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
