import type { Metadata } from 'next';

import { TablesClient } from './tables-client';

export const metadata: Metadata = { title: 'Tables' };

/** Table Master, and the QR stickers that point at it. */
export default function AdminTablesPage() {
  return <TablesClient />;
}
