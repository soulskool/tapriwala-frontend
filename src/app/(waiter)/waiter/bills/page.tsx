import type { Metadata } from 'next';

import { CompletedBills } from '@/components/billing/completed-bills';

export const metadata: Metadata = { title: 'Billed' };

/**
 * Bill history for the floor.
 *
 * The same component the counter uses, but reached through the waiter layout,
 * so a waiter can answer "what was M2 charged?" standing at the table instead
 * of walking a guest to the counter.
 *
 * Read-only, and not by omission: the server allows `waiter` on the two GET
 * export routes only. Generating a bill, confirming it against the POS and
 * closing a table all remain the billing role's, enforced in
 * `backend/src/routes/billing.routes.ts`.
 */
export default function WaiterBillsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="print-hidden text-xl font-bold">Billed sessions</h1>
      <CompletedBills />
    </div>
  );
}
