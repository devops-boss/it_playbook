import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { EmptyState } from '@/components/ui/empty-state';
import { IconHistory } from '@tabler/icons-react';

export const dynamic = 'force-dynamic';

export default async function RecentlyViewedPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Recently Viewed</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Troubleshooting workflows and solutions you opened recently.
          </p>
        </div>

        <EmptyState
          icon={IconHistory}
          title="No recent history"
          description="Scenarios and guides you read will automatically appear here."
        />
      </div>
    </div>
  );
}
