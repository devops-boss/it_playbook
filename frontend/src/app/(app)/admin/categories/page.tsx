import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { CategoryTreeManager } from '@/components/admin/category-tree-manager';
import { can, getCurrentUser } from '@/lib/auth';
import { getCategories } from '@/lib/data/criteria';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Categories',
};

export default async function CategoriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (!can(user, 'manage_criteria')) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-sm font-semibold">Not available</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          You do not have permission to manage categories.
        </p>
      </div>
    );
  }

  const categories = await getCategories(true);

  return <CategoryTreeManager categories={categories} />;
}
