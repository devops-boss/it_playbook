import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getAccounts, getCategories } from '@/lib/data/criteria';
import { DraftsList, DraftItemData } from '@/components/scenarios/drafts-list';

export const dynamic = 'force-dynamic';

export default async function MyDraftsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const canSeeAllDrafts =
    user.isSuperAdmin ||
    user.permissions.global.has('edit_any_scenario');

  let myDraftsRows: any[] = [];
  let teamDraftsRows: any[] = [];
  let accounts: any[] = [];
  let categories: any[] = [];

  try {
    const supabase = createClient();

    const [myDraftsRes, teamDraftsRes, accs, cats] = await Promise.all([
      supabase
        .from('pb_scenarios')
        .select(
          'id, title, slug, summary, quick_fix, status, updated_at, created_at, created_by, account_id, category_id, is_global, tags, custom_sections',
        )
        .eq('status', 'draft')
        .eq('created_by', user.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false }),
      canSeeAllDrafts
        ? supabase
            .from('pb_scenarios')
            .select(
              'id, title, slug, summary, quick_fix, status, updated_at, created_at, created_by, account_id, category_id, is_global, tags, custom_sections',
            )
            .eq('status', 'draft')
            .is('deleted_at', null)
            .order('updated_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      getAccounts().catch(() => []),
      getCategories().catch(() => []),
    ]);

    myDraftsRows = myDraftsRes.data ?? [];
    teamDraftsRows = teamDraftsRes.data ?? [];
    accounts = accs;
    categories = cats;
  } catch (err) {
    console.error('Error fetching drafts data:', err);
  }

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const mapDraftItem = (row: any): DraftItemData => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    status: row.status,
    updated_at: row.updated_at,
    created_at: row.created_at,
    created_by: row.created_by,
    account_id: row.account_id,
    category_id: row.category_id,
    is_global: row.is_global,
    tags: row.tags,
    custom_sections: row.custom_sections,
    accountName: row.is_global
      ? 'All Accounts (Global)'
      : row.account_id
        ? accountMap.get(row.account_id) ?? null
        : null,
    categoryName: row.category_id ? categoryMap.get(row.category_id) ?? null : null,
  });

  const myDrafts: DraftItemData[] = myDraftsRows.map(mapDraftItem);
  const teamDrafts: DraftItemData[] = teamDraftsRows.map(mapDraftItem);

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl">
        <DraftsList
          myDrafts={myDrafts}
          teamDrafts={teamDrafts}
          canSeeAllDrafts={canSeeAllDrafts}
          currentUserId={user.id}
        />
      </div>
    </div>
  );
}
