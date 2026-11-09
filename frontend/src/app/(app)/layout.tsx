import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { getAccessibleAccounts, getCurrentUser } from '@/lib/auth';
import { getCategories, getCriteriaFields } from '@/lib/data/criteria';

export const dynamic = 'force-dynamic';

/**
 * The authenticated application shell.
 *
 * Everything the shell needs (accounts, categories, criteria fields) is
 * loaded here from the database, so the navigation, filters and facets all
 * reflect live configuration with no code changes.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [accounts, categories, criteriaFields] = await Promise.all([
    getAccessibleAccounts(user),
    getCategories(false),
    getCriteriaFields('scenarios'),
  ]);

  const permissions = Array.from(user.permissions.global);

  return (
    <AppShell
      accounts={accounts}
      categories={categories}
      criteriaFields={criteriaFields}
      user={{
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        photoUrl: user.photoUrl,
        isSuperAdmin: user.isSuperAdmin,
        roleNames: user.roleNames,
        permissions,
      }}
    >
      {children}
    </AppShell>
  );
}
