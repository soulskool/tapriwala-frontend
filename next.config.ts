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

const nextConfig: NextConfig = {
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
