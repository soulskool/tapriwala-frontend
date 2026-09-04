import type { Metadata } from 'next';

import { OverviewClient } from './overview-client';

export const metadata: Metadata = { title: 'Overview' };

/**
 * Live ops visibility (§10).
 *
 * One read-only screen with the whole floor, so ownership never has to walk
 * the room or interrupt staff mid-service to find out what is happening.
 */
export default function AdminPage() {
  return <OverviewClient />;
}
