import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { CriteriaBuilder } from '@/components/admin/criteria-builder';
import { can, getAccessibleAccounts, getCurrentUser } from '@/lib/auth';
import { getCriteriaFields, getOptionsForFields } from '@/lib/data/criteria';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Criteria builder',
};

export default async function CriteriaPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (!can(user, 'manage_criteria')) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-sm font-semibold">Not available</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          You do not have permission to manage criteria.
        </p>
      </div>
    );
  }

  const fields = await getCriteriaFields('scenarios');
  const optionsByField = await getOptionsForFields(fields.map((f) => f.id));
  const accounts = await getAccessibleAccounts(user);

  return (
    <CriteriaBuilder
      fields={fields}
      optionsByField={optionsByField}
      accounts={accounts}
    />
  );
}
