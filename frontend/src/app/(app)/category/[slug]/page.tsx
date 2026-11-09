import { notFound } from 'next/navigation';
import { toUpstreamError } from '@/lib/api-error';
import type { Metadata } from 'next';
import { CategoryPlaybook } from '@/components/categories/category-playbook';
import { getAccessibleAccounts, getCurrentUser } from '@/lib/auth';
import { getCategories } from '@/lib/data/criteria';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const categories = await getCategories(true);
  const category = categories.find((c) => c.slug === params.slug);
  return { title: category?.name ?? 'Category' };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { accounts?: string; match?: string; subcategories?: string };
}) {
  const categories = await getCategories(true);
  const category = categories.find((c) => c.slug === params.slug);
  if (!category) notFound();

  const user = await getCurrentUser();
  const accounts = await getAccessibleAccounts(user);

  const accountIds = (searchParams.accounts ?? '')
    .split(',')
    .filter(Boolean)
    .filter((id) => accounts.some((a) => a.id === id));

  const accountMatch = (searchParams.match ?? 'any') as 'any' | 'all' | 'only';
  const includeSubcategories = searchParams.subcategories !== '0';

  const supabase = createClient();
  const { data: rows, error } = await supabase.rpc('get_category_playbook', {
    p_category_id: category.id,
    p_account_ids: accountIds.length > 0 ? accountIds : null,
    p_account_match: accountMatch,
    p_include_subcategories: includeSubcategories,
  });
  if (error) throw toUpstreamError(error);

  // Build the ancestor chain for the breadcrumb.
  const ancestors: { id: string; name: string; slug: string }[] = [];
  let parentId = category.parent_id;
  while (parentId) {
    const parent = categories.find((c) => c.id === parentId);
    if (!parent) break;
    ancestors.unshift({ id: parent.id, name: parent.name, slug: parent.slug });
    parentId = parent.parent_id;
  }

  const children = categories.filter((c) => c.parent_id === category.id);

  return (
    <CategoryPlaybook
      category={category}
      ancestors={ancestors}
      children={children}
      rows={rows ?? []}
      accounts={accounts}
      accountMatch={accountMatch}
      selectedAccountIds={accountIds}
      includeSubcategories={includeSubcategories}
    />
  );
}
