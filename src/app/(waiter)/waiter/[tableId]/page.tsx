import type { Metadata } from 'next';

import { TableOrderClient } from './order-client';

export const metadata: Metadata = { title: 'Table' };

/** One table: its running session, its rounds, and the picker to add more. */
export default async function WaiterTablePage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = await params;
  return <TableOrderClient tableId={tableId} />;
}
