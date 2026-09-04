import type { Metadata } from 'next';

import { AuditClient } from './audit-client';

export const metadata: Metadata = { title: 'Audit' };

/** The scrutiny trail — who did what, when, and what it looked like before. */
export default function AdminAuditPage() {
  return <AuditClient />;
}
