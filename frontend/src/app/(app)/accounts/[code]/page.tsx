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
import type { Account } from '@/types/database';

export const dynamic = 'force-dynamic';

const GLOBAL_ACCOUNT: Account = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Global Scenarios',
  code: 'GLOBAL',
  accent_color: '#0284c7',
  description: 'Universal standard operating procedures, global IT policies, and organization-wide playbooks.',
  status: 'Active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  metadata: {},
  settings: {
    tabs: [
      { key: 'all', label: 'All Global Playbooks' },
      { key: 'frequent', label: 'Frequent Incidents' },
      { key: 'critical', label: 'Critical / P1' },
      { key: 'by_category', label: 'By Category' },
    ],
  },
};

export async function generateMetadata({
  params,
}: {
  params: { code: string };
}): Promise<Metadata> {
  if (params.code.toUpperCase() === 'GLOBAL') {
    return {
      title: 'Global Scenarios | IT Operations Playbook',
      description: 'Universal standard operating procedures, global IT policies, and organization-wide playbooks.',
    };
  }
  const user = await getCurrentUser();
  const accounts = await getAccessibleAccounts(user);
  const account = accounts.find((a) => a.code.toUpperCase() === params.code.toUpperCase());
  return {
    title: account ? `${account.name} (${account.code}) | IT Operations Playbook` : 'IT Operations Playbook',
    description: account?.description ?? 'Client incident management and troubleshooting playbooks.',
  };
}

export default async function AccountPage({
  params,
}: {
  params: { code: string };
}) {
  const isGlobal = params.code.toUpperCase() === 'GLOBAL';
  const user = await getCurrentUser();
  const accounts = await getAccessibleAccounts(user);
  const account = isGlobal
    ? GLOBAL_ACCOUNT
    : accounts.find((a) => a.code.toUpperCase() === params.code.toUpperCase());

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
