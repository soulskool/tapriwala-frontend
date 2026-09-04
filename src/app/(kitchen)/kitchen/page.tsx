import type { Metadata } from 'next';

import { KdsBoardClient } from './kds-board-client';

export const metadata: Metadata = { title: 'Kitchen' };

/**
 * The KDS.
 *
 * Entirely a Client Component below this line — every element on the board is
 * live or interactive, so there is no static half worth rendering on the
 * server.
 */
export default function KitchenPage() {
  return <KdsBoardClient />;
}
