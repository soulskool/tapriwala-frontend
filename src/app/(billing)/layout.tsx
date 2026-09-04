import { AuthGuard } from '@/components/layout/auth-guard';
import { RoleHeader } from '@/components/layout/role-header';
import { ROLES } from '@/lib/constants';

/** The counter. Billing only — closing a session is what frees a table. */
export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allow={[ROLES.BILLING]}>
      <RoleHeader title="Billing" />
      <main className="mx-auto max-w-[1400px] px-4 py-4">{children}</main>
    </AuthGuard>
  );
}
