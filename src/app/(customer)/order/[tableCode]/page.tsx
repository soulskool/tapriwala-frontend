import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { fetchPublic } from '@/lib/server-fetch';
import type { MenuCategory, ResolvedTable } from '@/lib/types';
import { OrderClient } from './order-client';

export const metadata: Metadata = { title: 'Order' };

/**
 * The guest's landing page, reached by scanning the sticker on their table.
 *
 * A Server Component on purpose: the table and the menu are fetched here and
 * rendered as HTML, so the first thing a guest sees does not wait on a JS
 * bundle. Only the cart and ordering layer below hydrates as client code.
 *
 * The URL segment is the table's own code, so the sticker on M2 reads
 * `/order/M2`. That is deliberately guessable: see the note on the backend's
 * TableMaster model for what it buys and what it costs.
 */
export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ tableCode: string }>;
}) {
  const { tableCode } = await params;

  const [resolved, menu] = await Promise.all([
    fetchPublic<ResolvedTable>(`/public/tables/${tableCode}`),
    fetchPublic<{ categories: MenuCategory[] }>(`/public/tables/${tableCode}/menu`),
  ]);

  // An unknown or retired token is a dead sticker, not an error page.
  if (!resolved) notFound();

  return (
    <OrderClient
      tableCode={tableCode}
      initialTable={resolved}
      initialMenu={menu?.categories ?? []}
    />
  );
}
