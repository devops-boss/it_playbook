import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AccountList } from '@/components/admin/account-list';
import { can, getAccessibleAccounts, getCurrentUser } from '@/lib/auth';
import { getCategories } from '@/lib/data/criteria';
import { getAllAccountMetrics } from '@/lib/data/account-playbook';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Accounts',
};

export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (!can(user, 'manage_accounts')) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-sm font-semibold">Not available</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          You do not have permission to manage accounts.
        </p>
      </div>
    );
  }

  const accounts = await getAccessibleAccounts(user);
  const categories = await getCategories(true);

  // Scenario count per account (only account-specific scenarios, excluding global SOPs)
  const counts: Record<string, number> = {};
  for (const account of accounts) {
    counts[account.id] = 0;
  }

  try {
    const metrics = await getAllAccountMetrics();
    if (metrics && metrics.length > 0) {
      for (const account of accounts) {
        const m = metrics.find((x) => x.account_id === account.id);
        if (m) {
          counts[account.id] = Number(m.account_specific_playbooks ?? 0);
        }
      }
    } else {
      throw new Error('No metrics returned from RPC');
    }
  } catch {
    // Direct database count fallback to guarantee 100% precision
    try {
      const supabase = createClient();
      const [directRes, multiRes] = await Promise.all([
        supabase
          .from('pb_scenarios')
          .select('id, account_id')
          .eq('status', 'published')
          .is('deleted_at', null)
          .not('account_id', 'is', null),
        supabase
          .from('pb_scenario_accounts')
          .select('scenario_id, account_id, scenario:pb_scenarios!inner(status, deleted_at)')
          .eq('scenario.status', 'published')
          .is('scenario.deleted_at', null),
      ]);

      const scenarioSets: Record<string, Set<string>> = {};
      for (const a of accounts) {
        scenarioSets[a.id] = new Set<string>();
      }

      if (directRes.data) {
        for (const row of directRes.data) {
          if (row.account_id && scenarioSets[row.account_id]) {
            scenarioSets[row.account_id].add(row.id);
          }
        }
      }

      if (multiRes.data) {
        for (const row of multiRes.data) {
          if (row.account_id && scenarioSets[row.account_id]) {
            scenarioSets[row.account_id].add(row.scenario_id);
          }
        }
      }

      for (const a of accounts) {
        counts[a.id] = scenarioSets[a.id]?.size ?? 0;
      }
    } catch (err) {
      console.warn('Fallback scenario count query error:', err);
    }
  }

  return (
    <AccountList accounts={accounts} categories={categories} counts={counts} />
  );
}
