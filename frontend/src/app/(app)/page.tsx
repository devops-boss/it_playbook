import { redirect } from 'next/navigation';
import { HomeDashboard } from '@/components/home/home-dashboard';
import { getAccessibleAccounts, getCurrentUser } from '@/lib/auth';
import {
  getCategories,
  getCriteriaFields,
  getCriteriaValuesForScenarios,
  getDocumentationPlaybooks,
  getOptionsForFields,
  getPlaybookMetaMap,
  searchScenarios,
} from '@/lib/data/criteria';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [accounts, categories, fields, recent, frequent, documentationPlaybooks] =
    await Promise.all([
      getAccessibleAccounts(user),
      getCategories(false),
      getCriteriaFields('scenarios'),
      searchScenarios({ sort: 'newest', pageSize: 12, accountIds: user?.accountIds ?? [] }),
      searchScenarios({ sort: 'frequency', pageSize: 12, accountIds: user?.accountIds ?? [] }),
      getDocumentationPlaybooks(8),
    ]);

  const allScenarioIds = [
    ...recent.results.map((r) => r.id),
    ...frequent.results.map((r) => r.id),
    ...documentationPlaybooks.map((d) => d.id),
  ];

  const [optionsByField, recentValues, frequentValues, docValues, metaMap] =
    await Promise.all([
      getOptionsForFields(fields.map((f) => f.id)),
      getCriteriaValuesForScenarios(recent.results.map((r) => r.id)),
      getCriteriaValuesForScenarios(frequent.results.map((r) => r.id)),
      getCriteriaValuesForScenarios(documentationPlaybooks.map((d) => d.id)),
      getPlaybookMetaMap(allScenarioIds),
    ]);

  // Segregate frequent and recent: troubleshooting scenarios only on the top sections
  const filteredFrequent = frequent.results
    .filter((r) => !metaMap[r.id]?.isDocumentation)
    .slice(0, 6);

  const filteredRecent = recent.results
    .filter((r) => !metaMap[r.id]?.isDocumentation)
    .slice(0, 6);

  // Count scenarios per account for the account tiles.
  const accountCounts: Record<string, number> = {};
  for (const account of accounts) {
    const { total } = await searchScenarios({
      accountIds: [account.id],
      pageSize: 1,
    });
    accountCounts[account.id] = total;
  }

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
    />
  );
}
