import type { Metadata } from 'next';

import { ConsolidationClient } from './consolidation-client';

export const metadata: Metadata = { title: 'Consolidate bill' };

/** The consolidation screen for one session. */
export default async function ConsolidatePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ConsolidationClient sessionId={sessionId} />;
}
