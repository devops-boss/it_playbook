import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AccountDirectory } from '@/components/accounts/account-directory';
import { getCurrentUser } from '@/lib/auth';
import { getAllAccountMetrics } from '@/lib/data/account-playbook';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Client Accounts Directory | Big Outsource IT Playbook',
  description: 'Directory of all 26 client accounts with playbooks, metrics, and incident history.',
};

export default async function AccountsIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const accounts = await getAllAccountMetrics();

  return <AccountDirectory accounts={accounts} />;
}
