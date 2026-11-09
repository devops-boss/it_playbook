import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getCriteriaFields, getAccounts } from '@/lib/data/criteria';
import { createClient } from '@/lib/supabase/server';
import { ScenarioAdminList } from '@/components/admin/scenario-admin-list';
import type { Scenario } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function AdminScenariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (
    !user.isSuperAdmin &&
    !user.permissions.global.has('create_scenarios') &&
    !user.permissions.global.has('edit_any_scenario') &&
    !user.permissions.global.has('edit_own_scenario')
  ) {
    redirect('/');
  }

  const supabase = createClient();
  const [{ data: scenarios }, fields, accounts] = await Promise.all([
    supabase
      .from('pb_scenarios')
      .select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(500),
    getCriteriaFields('scenarios'),
    getAccounts(true),
  ]);

  return (
    <div className="px-4 py-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-sm font-semibold">Scenarios</h1>
          <p className="text-2xs text-muted-foreground">
            Every scenario in the knowledge base. Select several to change
            their criteria or status in one go.
          </p>
        </div>

        <ScenarioAdminList
          scenarios={(scenarios ?? []) as Scenario[]}
          fields={fields}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        />
      </div>
    </div>
  );
}
