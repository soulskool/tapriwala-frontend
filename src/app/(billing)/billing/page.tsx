import type { Metadata } from 'next';

import { BillingQueueClient } from './billing-client';

export const metadata: Metadata = { title: 'Billing' };

/** Tables asking to pay, plus every other open session for manual browsing. */
export default function BillingPage() {
  return <BillingQueueClient />;
}
