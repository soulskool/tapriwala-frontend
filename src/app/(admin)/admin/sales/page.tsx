import type { Metadata } from 'next';

import { SalesClient } from './sales-client';

export const metadata: Metadata = { title: 'Sales' };

/** Every sales report: day-wise, item-wise, multi price, category-wise and item by day/month. */
export default function AdminSalesPage() {
  return <SalesClient />;
}
