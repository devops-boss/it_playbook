import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { EmptyState } from '@/components/ui/empty-state';
import { IconStar } from '@tabler/icons-react';

export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Favorites</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Bookmarked troubleshooting playbooks and quick fix scenarios for fast reference.
          </p>
        </div>

        <EmptyState
          icon={IconStar}
          title="No favorite scenarios saved yet"
          description="Star any scenario while reading to add it here for one-click access during live support tickets."
        />
      </div>
    </div>
  );
}
