import { AuthGuard } from '@/components/layout/auth-guard';
import { RoleHeader } from '@/components/layout/role-header';
import { ROLES } from '@/lib/constants';

/**
 * Printer setup — for every role that prints.
 *
 * The counter prints bills, the kitchen and the floor print KOTs, and admin
 * gets in by policy. The setting it changes belongs to the *device*, not to
 * whoever is signed in, so any of them may set it up.
 */
export default function PrinterLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allow={[ROLES.BILLING, ROLES.KITCHEN, ROLES.WAITER]}>
      <RoleHeader title="Printer" />
      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
    </AuthGuard>
  );
}
