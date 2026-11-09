import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getAnalyticsData } from '@/lib/data/admin';
import { AnalyticsDashboard } from '@/components/admin/analytics-dashboard';

export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (
    !user.isSuperAdmin &&
    !user.permissions.global.has('view_analytics')
  ) {
    redirect('/');
  }

  const data = await getAnalyticsData();

  return (
    <div className="px-4 py-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="text-sm font-semibold">Analytics</h1>
          <p className="text-2xs text-muted-foreground">
            What people search for, what they fail to find, and where the
            documentation is thin.
          </p>
        </div>

        <AnalyticsDashboard data={data} />
      </div>
    </div>
  );
}
