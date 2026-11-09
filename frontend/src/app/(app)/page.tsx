import { redirect } from 'next/navigation';
import { HomeDashboard } from '@/components/home/home-dashboard';
import { getAccessibleAccounts, getCurrentUser } from '@/lib/auth';
import {
  getCategories,
  getCriteriaFields,
  getCriteriaValuesForScenarios,
  getOptionsForFields,
  searchScenarios,
} from '@/lib/data/criteria';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [accounts, categories, fields, recent, frequent] = await Promise.all([
    getAccessibleAccounts(user),
    getCategories(false),
    getCriteriaFields('scenarios'),
    searchScenarios({ sort: 'newest', pageSize: 6, accountIds: user?.accountIds ?? [] }),
    searchScenarios({ sort: 'frequency', pageSize: 6, accountIds: user?.accountIds ?? [] }),
  ]);

  const [optionsByField, recentValues, frequentValues] = await Promise.all([
    getOptionsForFields(fields.map((f) => f.id)),
    getCriteriaValuesForScenarios(recent.results.map((r) => r.id)),
    getCriteriaValuesForScenarios(frequent.results.map((r) => r.id)),
  ]);

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
      recent={recent.results}
      recentValues={recentValues}
      frequent={frequent.results}
      frequentValues={frequentValues}
      accountCounts={accountCounts}
      userName={user?.displayName ?? 'there'}
    />
  );
}
