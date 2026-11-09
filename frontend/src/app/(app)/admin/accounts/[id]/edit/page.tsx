import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AccountWizard } from '@/components/admin/account-wizard';
import { can, getAccessibleAccounts, getCurrentUser } from '@/lib/auth';
import { getCategories } from '@/lib/data/criteria';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Edit account',
};

export default async function EditAccountPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!can(user, 'manage_accounts')) redirect('/admin/accounts');

  const [accounts, categories] = await Promise.all([
    getAccessibleAccounts(user),
    getCategories(true),
  ]);

  const account = accounts.find((a) => a.id === params.id);
  if (!account) notFound();

  return (
    <AccountWizard accounts={accounts} categories={categories} account={account} />
  );
}
