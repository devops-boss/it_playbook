import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getAdminData } from '@/lib/data/admin';
import { RolesPanel, UsersPanel } from '@/components/admin/roles-panel';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (
    !user.isSuperAdmin &&
    !user.permissions.global.has('manage_users') &&
    !user.permissions.global.has('manage_roles')
  ) {
    redirect('/');
  }

  const data = await getAdminData();

  return (
    <div className="px-4 py-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-sm font-semibold">Users &amp; roles</h1>
          <p className="text-2xs text-muted-foreground">
            There is no public sign-up. Users are created here and given roles
            and account access.
          </p>
        </div>

        <UsersPanel
          users={data.users}
          roles={data.roles}
          accounts={data.accounts}
        />

        <RolesPanel
          roles={data.roles}
          rolePermissions={data.rolePermissions}
          accounts={data.accounts}
        />
      </div>
    </div>
  );
}
