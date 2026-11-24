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
    <div className="px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Users &amp; Roles</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage team member credentials, security roles, and client account access permissions.
          </p>
        </div>

        <UsersPanel
          users={data.users}
          roles={data.roles}
          accounts={data.accounts}
          isSuperAdmin={user.isSuperAdmin}
          currentUserId={user.id}
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
