import type { Metadata } from 'next';

import { UsersClient } from './users-client';

export const metadata: Metadata = { title: 'Staff' };

/** Staff accounts and their PINs. */
export default function AdminUsersPage() {
  return <UsersClient />;
}
