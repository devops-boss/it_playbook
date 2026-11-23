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
  try {
    const { data, error } = await supabase.rpc('get_account_metrics', {
      p_account_id: accountId,
    });
    if (!error && data && data.length > 0) {
      return data[0] as AccountMetrics;
    }
  } catch (err) {
    console.warn('RPC get_account_metrics failed, falling back:', err);
  }

  // Fallback if RPC fails or returns empty
  return {
    account_id: accountId,
    account_name: accountId === '00000000-0000-0000-0000-000000000000' ? 'Global Scenarios' : 'Account',
    account_code: accountId === '00000000-0000-0000-0000-000000000000' ? 'GLOBAL' : 'CLIENT',
    accent_color: '#0284c7',
    total_playbooks: 0,
    account_specific_playbooks: 0,
    global_playbooks: 0,
    total_occurrences: 0,
    categories_covered: 0,
    last_updated_at: null,
  };
}

/** Get live metrics for all accounts for the directory view. */
export async function getAllAccountMetrics(): Promise<AccountMetrics[]> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase.rpc('get_all_account_metrics');
    if (!error && data) {
      return data as AccountMetrics[];
    }
    if (error) {
      console.warn('RPC get_all_account_metrics returned error:', error.message);
    }
  } catch (err) {
    console.warn('RPC get_all_account_metrics exception:', err);
  }

  // Resilient fallback: Query pb_accounts directly so /accounts NEVER throws an error boundary
  try {
    const { data: accounts } = await supabase
      .from('pb_accounts')
      .select('id, name, code, accent_color, description, status')
      .order('name');

    const list: AccountMetrics[] = [
      {
        account_id: '00000000-0000-0000-0000-000000000000',
        account_name: 'Global Scenarios',
        account_code: 'GLOBAL',
        accent_color: '#0284c7',
        description: 'Universal standard operating procedures, global IT policies, and organization-wide playbooks.',
        status: 'Active',
        total_playbooks: 0,
        account_specific_playbooks: 0,
        global_playbooks: 0,
        total_occurrences: 0,
        categories_covered: 0,
        last_updated_at: null,
      },
    ];

    if (accounts) {
      for (const a of accounts) {
        list.push({
          account_id: a.id,
          account_name: a.name,
          account_code: a.code,
          accent_color: a.accent_color ?? '#0284c7',
          description: a.description ?? null,
          status: a.status ?? 'Active',
          total_playbooks: 0,
          account_specific_playbooks: 0,
          global_playbooks: 0,
          total_occurrences: 0,
          categories_covered: 0,
          last_updated_at: null,
        });
      }
    }
    return list;
  } catch {
    return [];
  }
}
