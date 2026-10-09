import type { Metadata } from 'next';

import { SalesClient } from './sales-client';

export const metadata: Metadata = { title: 'Sales' };

/** Day-wise sales — what each day took, from paid bills. */
export default function AdminSalesPage() {
  return <SalesClient />;
}
