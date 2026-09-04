import type { Metadata, Viewport } from 'next';

import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ACD Cafe',
    template: '%s · ACD Cafe',
  },
  description: 'Real-time ordering, kitchen display and billing for ACD Cafe.',
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
