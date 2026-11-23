import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { getAccessibleAccounts, getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getCategories, getCriteriaFields } from '@/lib/data/criteria';
import { ensureDefaultAccountsAndCategories } from '@/lib/data/ensure-defaults';

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

  // Guarantee accounts, EDR/ESET categories, and permissions exist
  await ensureDefaultAccountsAndCategories();

  const [accountsRes, categoriesRes, fieldsRes, draftsRes] = await Promise.allSettled([
    getAccessibleAccounts(user),
    getCategories(false),
    getCriteriaFields('scenarios'),
    (async () => {
      const supabase = createClient();
      const canSeeAllDrafts =
        user.isSuperAdmin ||
        user.permissions.global.has('edit_any_scenario');

      let query = supabase
        .from('pb_scenarios')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft')
        .is('deleted_at', null);

      if (!canSeeAllDrafts) {
        query = query.eq('created_by', user.id);
      }

      const { count } = await query;
      return count ?? 0;
    })(),
  ]);

  const accounts = accountsRes.status === 'fulfilled' ? accountsRes.value : [];
  const categories = categoriesRes.status === 'fulfilled' ? categoriesRes.value : [];
  const criteriaFields = fieldsRes.status === 'fulfilled' ? fieldsRes.value : [];
  const draftsCount = draftsRes.status === 'fulfilled' ? draftsRes.value : 0;

  const permissions = Array.from(user.permissions.global);

  return (
    <AppShell
      accounts={accounts}
      categories={categories}
      criteriaFields={criteriaFields}
      draftsCount={draftsCount}
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
