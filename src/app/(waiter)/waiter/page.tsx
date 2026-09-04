import type { Metadata } from 'next';

import { FloorClient } from './floor-client';

export const metadata: Metadata = { title: 'Floor' };

/**
 * The live table screen.
 *
 * A thin server shell: every tile on this page changes from a socket event, so
 * there is nothing worth rendering on the server that would not be stale by
 * the time it arrived.
 */
export default function WaiterPage() {
  return <FloorClient />;
}
