import type { Metadata, Viewport } from 'next';

import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Tapriwala by Treatmeets',
    template: '%s · Tapriwala by Treatmeets',
  },
  description: 'Real-time ordering, kitchen display and billing for Tapriwala by Treatmeets.',
  // The tab icon is `src/app/icon.png` — a file-convention Next picks up on its
  // own, which is why there is no `icons` key here. It is a 256px render of the
  // café's logo (`public/icon.svg`); the SVG itself is 5 MB because the artwork
  // is an embedded photo, and no tab is worth 5 MB on café Wi-Fi.
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
