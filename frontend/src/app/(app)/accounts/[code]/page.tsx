import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AccountPlaybook } from '@/components/accounts/account-playbook';
import { getAccessibleAccounts, getCurrentUser } from '@/lib/auth';
import {
  getAccountMetrics,
  getAccountPlaybook,
  resolveAccountTabs,
  DEFAULT_ACCOUNT_TABS,
} from '@/lib/data/account-playbook';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { code: string };
}): Promise<Metadata> {
  const user = await getCurrentUser();
  const accounts = await getAccessibleAccounts(user);
  const account = accounts.find((a) => a.code.toUpperCase() === params.code.toUpperCase());
  return {
    title: account ? `${account.name} (${account.code}) | Big Outsource Playbook` : 'Account Playbook',
    description: account?.description ?? 'Client incident management and troubleshooting playbooks.',
  };
}

export default async function AccountPage({
  params,
}: {
  params: { code: string };
}) {
  const user = await getCurrentUser();
  const accounts = await getAccessibleAccounts(user);
  const account = accounts.find(
    (a) => a.code.toUpperCase() === params.code.toUpperCase(),
  );

  if (!account) notFound();

  const [metrics, tabs] = await Promise.all([
    getAccountMetrics(account.id),
    Promise.resolve(resolveAccountTabs(account.settings)),
  ]);

  // Load every configured view in parallel; the client shows one at a time.
  const viewKeys = Array.from(
    new Set([...tabs.map((t) => t.key), ...DEFAULT_ACCOUNT_TABS.map((t) => t.key)]),
  );
  const loaded = await Promise.all(
    viewKeys.map(async (key) => ({
      key,
      rows: await getAccountPlaybook(account.id, key),
    })),
  );
  const views = Object.fromEntries(loaded.map((v) => [v.key, v.rows]));

  return <AccountPlaybook account={account} metrics={metrics} tabs={tabs} views={views} />;
}
