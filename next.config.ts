import type { NextConfig } from 'next';

/**
 * Hosts `next/image` is allowed to optimise from.
 *
 * Driven by env rather than hardcoded because the same build runs against a
 * local Express server in development (`STORAGE_DRIVER=local`, images served
 * from :5010/uploads) and Bunny's CDN in production. Set
 * NEXT_PUBLIC_IMAGE_ORIGINS to a comma-separated list of origins, e.g.
 *   https://lms-anyonecandance.b-cdn.net,http://localhost:5010
 */
const imageOrigins = (process.env.NEXT_PUBLIC_IMAGE_ORIGINS ?? 'http://localhost:5010')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/** `https://api.cafe.com/api/v1` → `https://api.cafe.com`. Bad input is skipped, not fatal. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The socket origin over WebSocket: https → wss, http → ws. */
function wsOriginOf(origin: string | null): string | null {
  return origin ? origin.replace(/^http/, 'ws') : null;
}

const isDev = process.env.NODE_ENV !== 'production';
const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5010/api/v1');
const socketOrigin = originOf(process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:5010');

const unique = (values: (string | null)[]): string =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value)))).join(' ');

/**
 * Content-Security-Policy, built from the same env the app already uses, so
 * the API, the socket and the image CDN are allowed and nothing else is.
 *
 * `script-src` keeps 'unsafe-inline' deliberately: Next.js streams its RSC
 * payload in inline <script> tags, and the only way to drop it is a per-request
 * nonce, which forces every page (the guest menu included) into dynamic
 * rendering. That trade was declined in the 2026-10 security audit; see
 * security/SECURITY_AUDIT.md. Everything else here is strict. `unsafe-eval` is
 * added in development only, where React's dev build needs it.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${unique(imageOrigins)}`,
  "font-src 'self' data:",
  `connect-src 'self' ${unique([apiOrigin, socketOrigin, wsOriginOf(socketOrigin)])}${isDev ? ' ws: wss:' : ''}`,
  "media-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Only when the API is itself https — otherwise a local `next start` against
  // http://localhost:5010 would have every API call rewritten to https and fail.
  ...(apiOrigin?.startsWith('https://') ? ['upgrade-insecure-requests'] : []),
].join('; ');

/**
 * Sent on every response Next serves — pages, `/_next/static` assets and
 * `/_next/image` alike — so nginx does not have to be trusted to add them.
 */
const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  // HSTS is ignored over plain http, so it is harmless on localhost; it only
  // matters once served over https.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  // No `X-Powered-By: Next.js` — it only tells a scanner which CVEs to try.
  poweredByHeader: false,

  // Never ship readable source to browsers (this is also Next's default; stated
  // so nobody flips it on to debug production and forgets).
  productionBrowserSourceMaps: false,

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },

  images: {
    remotePatterns: imageOrigins.map((origin) => new URL(`${origin.replace(/\/$/, '')}/**`)),
    // Menu photos render at a handful of fixed sizes; no point generating more.
    imageSizes: [64, 96, 128, 256],
    deviceSizes: [360, 420, 640, 828, 1080],
  },

  // Fails the build on a type error rather than shipping a broken screen.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
