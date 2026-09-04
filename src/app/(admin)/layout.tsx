import { AuthGuard } from '@/components/layout/auth-guard';
import { RoleHeader } from '@/components/layout/role-header';
import { ROLES } from '@/lib/constants';

/** Master data and live ops visibility. Admin only. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allow={[ROLES.ADMIN]}>
      <RoleHeader title="Admin" />
      <main className="mx-auto max-w-[1600px] px-4 py-4">{children}</main>
    </AuthGuard>
  );
}
