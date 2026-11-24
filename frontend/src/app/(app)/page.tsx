import { redirect } from 'next/navigation';
import { HomeDashboard } from '@/components/home/home-dashboard';
import { getAccessibleAccounts, getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  getCategories,
  getCriteriaFields,
  getCriteriaValuesForScenarios,
  getDocumentationPlaybooks,
  getGlobalScenariosCount,
  getOptionsForFields,
  getPlaybookMetaMap,
  searchScenarios,
} from '@/lib/data/criteria';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  try {
    const [accountsRes, categoriesRes, fieldsRes, recentRes, frequentRes, docRes, draftsRes] =
      await Promise.allSettled([
        getAccessibleAccounts(user),
        getCategories(false),
        getCriteriaFields('scenarios'),
        searchScenarios({ sort: 'newest', pageSize: 12, accountIds: user?.accountIds ?? [] }),
        searchScenarios({ sort: 'frequency', pageSize: 12, accountIds: user?.accountIds ?? [] }),
        getDocumentationPlaybooks(8),
        (async () => {
          const supabase = createClient();
          const { count } = await supabase
            .from('pb_scenarios')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'draft')
            .eq('created_by', user.id)
            .is('deleted_at', null);
          return count ?? 0;
        })(),
      ]);

    const accounts = accountsRes.status === 'fulfilled' ? accountsRes.value : [];
    const categories = categoriesRes.status === 'fulfilled' ? categoriesRes.value : [];
    const fields = fieldsRes.status === 'fulfilled' ? fieldsRes.value : [];
    const recent = recentRes.status === 'fulfilled' ? recentRes.value : { results: [], total: 0 };
    const frequent = frequentRes.status === 'fulfilled' ? frequentRes.value : { results: [], total: 0 };
    const documentationPlaybooks = docRes.status === 'fulfilled' ? docRes.value : [];
    const draftsCount = draftsRes.status === 'fulfilled' ? draftsRes.value : 0;

    const allScenarioIds = [
      ...recent.results.map((r) => r.id),
      ...frequent.results.map((r) => r.id),
      ...documentationPlaybooks.map((d) => d.id),
    ];

    const [optionsRes, recentValRes, freqValRes, docValRes, metaRes] =
      await Promise.allSettled([
        getOptionsForFields(fields.map((f) => f.id)),
        getCriteriaValuesForScenarios(recent.results.map((r) => r.id)),
        getCriteriaValuesForScenarios(frequent.results.map((r) => r.id)),
        getCriteriaValuesForScenarios(documentationPlaybooks.map((d) => d.id)),
        getPlaybookMetaMap(allScenarioIds),
      ]);

    const optionsByField = optionsRes.status === 'fulfilled' ? optionsRes.value : {};
    const recentValues = recentValRes.status === 'fulfilled' ? recentValRes.value : {};
    const frequentValues = freqValRes.status === 'fulfilled' ? freqValRes.value : {};
    const docValues = docValRes.status === 'fulfilled' ? docValRes.value : {};
    const metaMap = metaRes.status === 'fulfilled' ? metaRes.value : {};

    // Segregate frequent and recent: troubleshooting scenarios only on the top sections
    const filteredFrequent = frequent.results
      .filter((r) => !metaMap[r.id]?.isDocumentation)
      .slice(0, 6);

    const filteredRecent = recent.results
      .filter((r) => !metaMap[r.id]?.isDocumentation)
      .slice(0, 6);

    // Count scenarios per account (strictly account-specific, excluding global scenarios).
    const accountCounts: Record<string, number> = {};
    await Promise.allSettled([
      ...accounts.map(async (account) => {
        try {
          const { total } = await searchScenarios({
            accountIds: [account.id],
            accountMatch: 'only',
            pageSize: 1,
          });
          accountCounts[account.id] = total;
        } catch {
          accountCounts[account.id] = 0;
        }
      }),
      (async () => {
        try {
          accountCounts['GLOBAL'] = await getGlobalScenariosCount();
        } catch {
          accountCounts['GLOBAL'] = 0;
        }
      })(),
    ]);

    return (
      <HomeDashboard
        accounts={accounts}
        categories={categories}
        fields={fields}
        optionsByField={optionsByField}
        recent={filteredRecent}
        recentValues={recentValues}
        frequent={filteredFrequent}
        frequentValues={frequentValues}
        documentationPlaybooks={documentationPlaybooks}
        docValues={docValues}
        accountCounts={accountCounts}
        userName={user?.displayName ?? 'there'}
        draftsCount={draftsCount}
      />
    );
  } catch (err) {
    console.error('Safe fallback on HomePage error:', err);
    return (
      <HomeDashboard
        accounts={[]}
        categories={[]}
        fields={[]}
        optionsByField={{}}
        recent={[]}
        recentValues={{}}
        frequent={[]}
        frequentValues={{}}
        documentationPlaybooks={[]}
        docValues={{}}
        accountCounts={{}}
        userName={user?.displayName ?? 'there'}
        draftsCount={0}
      />
    );
  }
}
