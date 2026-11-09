import { createClient } from '@/lib/supabase/server';
import { toUpstreamError } from '@/lib/api-error';
import type { AccountMetrics, AccountPlaybookRow } from '@/types/database';

/**
 * The account playbook, compiled from the same scenarios the search uses.
 *
 * Tabs are configurable per account via `pb_accounts.settings.tabs`, so an
 * admin can rename, reorder, add or remove tabs without a code change.
 */
export const DEFAULT_ACCOUNT_TABS = [
  { key: 'all', label: 'All Playbooks' },
  { key: 'frequent', label: 'Frequent Incidents' },
  { key: 'critical', label: 'Critical / P1' },
  { key: 'by_category', label: 'By Category' },
  { key: 'account_only', label: 'Account Specific' },
  { key: 'global_only', label: 'Global SOPs' },
];

export interface AccountTab {
  key: string;
  label: string;
  /** Hide the tab without deleting it. */
  hidden?: boolean;
}

export function resolveAccountTabs(settings: unknown): AccountTab[] {
  const configured = (settings as { tabs?: AccountTab[] } | null)?.tabs;
  if (!Array.isArray(configured) || configured.length === 0) {
    return DEFAULT_ACCOUNT_TABS;
  }
  return configured
    .filter((tab) => tab && typeof tab.key === 'string')
    .map((tab) => ({ key: tab.key, label: tab.label ?? tab.key, hidden: tab.hidden }));
}

/** Scenarios for an account, grouped by the requested view. */
export async function getAccountPlaybook(
  accountId: string,
  view: string,
): Promise<AccountPlaybookRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_account_playbook', {
    p_account_id: accountId,
    p_view: view,
  });
  if (error) throw toUpstreamError(error);
  return (data ?? []) as AccountPlaybookRow[];
}

/** Get metrics for a single account (total playbooks, incidents, categories). */
export async function getAccountMetrics(
  accountId: string,
): Promise<AccountMetrics | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_account_metrics', {
    p_account_id: accountId,
  });
  if (error) throw toUpstreamError(error);
  return ((data ?? [])[0] as AccountMetrics) ?? null;
}

/** Get live metrics for all 26 accounts for the directory view. */
export async function getAllAccountMetrics(): Promise<AccountMetrics[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_all_account_metrics');
  if (error) throw toUpstreamError(error);
  return (data ?? []) as AccountMetrics[];
}
