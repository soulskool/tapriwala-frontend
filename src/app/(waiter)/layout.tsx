import { AuthGuard } from '@/components/layout/auth-guard';
import { RoleHeader } from '@/components/layout/role-header';
import { ROLES } from '@/lib/constants';

/**
 * The floor screens.
 *
 * Billing staff are allowed in too: at the counter they routinely need to look
 * at a table before settling it, and admin gets everything by policy.
 */
export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allow={[ROLES.WAITER, ROLES.BILLING]}>
      <RoleHeader title="Floor" />
      <main className="mx-auto max-w-[1600px] px-4 py-4">{children}</main>
    </AuthGuard>
  );
}
