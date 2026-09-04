import type { Metadata } from 'next';

import { ProductsClient } from './products-client';

export const metadata: Metadata = { title: 'Menu' };

/** Product Master — the link to the legacy POS lives in `productCode`. */
export default function AdminProductsPage() {
  return <ProductsClient />;
}
