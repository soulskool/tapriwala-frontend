import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Vitest for the frontend.
 *
 * Deliberately narrow. The suite covers the things that break a shift when
 * they regress — money, elapsed time, the receipt's column grid, the
 * frontend/backend constant contract, role gating, the cart's idempotency key
 * and the realtime wiring — and covers nothing a designer changing a label or
 * a colour would touch. Tests that assert on button copy or Tailwind classes
 * are worse than no tests: they fail on every redesign and train everyone to
 * ignore a red suite.
 *
 * No `@vitejs/plugin-react` on purpose. Next 16 installs rolldown-vite at the
 * top level while Vitest carries its own Vite, so a plugin typed against one
 * does not satisfy the other and `tsc --noEmit` fails on this file. Nothing
 * here needs the plugin: esbuild transforms the TSX from `jsx: react-jsx` in
 * tsconfig, and Fast Refresh is meaningless in a test run.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // The constants contract test imports the backend's constants file, which
    // lives outside this package's root.
    server: { deps: { inline: [/backend[\\/]src/] } },
  },
});
