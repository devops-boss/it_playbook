import type { Metadata } from 'next';
import { IconSearch } from '@tabler/icons-react';
import { SearchResults } from '@/components/search/search-results';
import { getAccessibleAccounts, getCurrentUser } from '@/lib/auth';
import { getCriteriaFields, getCategories } from '@/lib/data/criteria';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search & Diagnosis | IT Operations Playbook',
  description: 'Instant sub-second search across troubleshooting playbooks, quick fixes, and HESK ticket tracking IDs.',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const user = await getCurrentUser();
  const [fields, accounts, categories] = await Promise.all([
    getCriteriaFields('scenarios'),
    getAccessibleAccounts(user),
    getCategories(false),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b bg-card/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#233B74] text-white shadow-xs">
            <IconSearch className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground">
              Playbook Search & Diagnosis
            </h1>
            <p className="text-xs text-muted-foreground">
              Instant sub-second search across SOPs, quick fixes, diagnostic commands, and HESK ticket tracking IDs.
            </p>
          </div>
        </div>
      </div>
      <SearchResults
        fields={fields}
        accounts={accounts}
        categories={categories}
        initialQuery={searchParams.q ?? ''}
      />
    </div>
  );
}
