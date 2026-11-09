import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getCategories, getAccounts } from '@/lib/data/criteria';
import { createClient } from '@/lib/supabase/server';
import { PlaybookAdmin } from '@/components/admin/playbook-admin';

export const dynamic = 'force-dynamic';

export default async function AdminPlaybooksPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (
    !user.isSuperAdmin &&
    !user.permissions.global.has('edit_any_scenario') &&
    !user.permissions.global.has('manage_criteria')
  ) {
    redirect('/');
  }

  const supabase = createClient();
  const [{ data: playbooks }, { data: scenarios }, accounts, categories] =
    await Promise.all([
      supabase
        .from('pb_playbooks')
        .select(
          'id, title, slug, description, type, status, account_id, smart_filter, sort_order',
        )
        .order('sort_order'),
      supabase
        .from('pb_scenarios')
        .select('id, title, slug, pb_accounts(name)')
        .is('deleted_at', null)
        .order('title')
        .limit(500),
      getAccounts(true),
      getCategories(true),
    ]);

  return (
    <div className="px-4 py-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="text-sm font-semibold">Playbooks</h1>
          <p className="text-2xs text-muted-foreground">
            A curated playbook is a hand-picked, ordered course of scenarios. A
            smart playbook is a live criteria filter that never goes stale.
          </p>
        </div>

        <PlaybookAdmin
          playbooks={(playbooks ?? []) as any[]}
          scenarios={(scenarios ?? []) as any[]}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>
    </div>
  );
}
