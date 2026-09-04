import { AuthGuard } from '@/components/layout/auth-guard';
import { RoleHeader } from '@/components/layout/role-header';
import { ROLES } from '@/lib/constants';

/**
 * The kitchen display.
 *
 * This used to render no header at all, on the argument that every pixel of
 * chrome is a pixel not showing a ticket. That cost more than it saved: an
 * admin who opened /kitchen lost the entire navigation and had no way back to
 * the floor or the counter except the browser's own controls.
 *
 * It now carries the same header as every other screen, with `confirmSignOut`
 * so the wall-mounted tablet keeps the protection the board's own button gave
 * it — a cook cannot sign the whole kitchen out with a knuckle mid-service.
 */
export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allow={[ROLES.KITCHEN, ROLES.WAITER]}>
      <RoleHeader title="Kitchen" confirmSignOut />
      {/* Full-bleed rather than the centred column the other screens use: the
          board is a ticket grid and every column of it is work in progress. */}
      <main className="overscroll-none-y px-3 py-3">{children}</main>
    </AuthGuard>
  );
}
