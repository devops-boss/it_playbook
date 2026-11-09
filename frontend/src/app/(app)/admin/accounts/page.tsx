import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AccountList } from '@/components/admin/account-list';
import { can, getAccessibleAccounts, getCurrentUser } from '@/lib/auth';
import { getCategories, searchScenarios } from '@/lib/data/criteria';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Accounts',
};

export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (!can(user, 'manage_accounts')) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-sm font-semibold">Not available</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          You do not have permission to manage accounts.
        </p>
      </div>
    );
  }

  const accounts = await getAccessibleAccounts(user);
  const categories = await getCategories(true);

  // Scenario count per account.
  const counts: Record<string, number> = {};
  for (const account of accounts) {
    const { total } = await searchScenarios({ accountIds: [account.id], pageSize: 1 });
    counts[account.id] = total;
  }

  return (
    <AccountList accounts={accounts} categories={categories} counts={counts} />
  );
}
