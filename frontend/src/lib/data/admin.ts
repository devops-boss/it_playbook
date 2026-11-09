import { createClient } from '@/lib/supabase/server';
import { throwOnFirstError } from '@/lib/api-error';
import type {
  Account,
  ConfigHistoryEntry,
  Outcome,
  Role,
  RolePermission,
  SectionDefinition,
  ScenarioTemplate,
  Synonym,
  Tag,
  NodeType,
} from '@/types/database';

/** All the data the admin area needs, loaded in parallel. */
export interface AdminData {
  roles: Role[];
  rolePermissions: RolePermission[];
  users: AdminUser[];
  settings: Record<string, unknown>;
  accountSettings: { account_id: string; settings: Record<string, unknown> }[];
  sections: SectionDefinition[];
  nodeTypes: NodeType[];
  outcomes: Outcome[];
  tags: Tag[];
  synonyms: Synonym[];
  templates: ScenarioTemplate[];
  auditLog: ConfigHistoryEntry[];
  accounts: Account[];
}

export interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  role_ids: string[];
  account_ids: string[];
}

export async function getAdminData(): Promise<AdminData> {
  const supabase = createClient();

  const [
    roles,
    rolePermissions,
    profiles,
    userRoles,
    userAccounts,
    globalSettings,
    accountSettings,
    sections,
    nodeTypes,
    outcomes,
    tags,
    synonyms,
    templates,
    auditLog,
    accounts,
  ] = await Promise.all([
    supabase.from('pb_roles').select('*').order('sort_order'),
    supabase.from('pb_role_permissions').select('*'),
    supabase.from('pb_user_profiles').select('*').order('display_name'),
    supabase.from('pb_user_roles').select('user_id, role_id'),
    supabase.from('pb_user_accounts').select('user_id, account_id'),
    supabase
      .from('pb_settings')
      .select('*')
      .eq('scope', 'global')
      .maybeSingle(),
    supabase.from('pb_settings').select('account_id, settings').eq('scope', 'account'),
    supabase.from('pb_section_definitions').select('*').order('sort_order'),
    supabase.from('pb_node_types').select('*').order('sort_order'),
    supabase.from('pb_outcomes').select('*').order('sort_order'),
    supabase.from('pb_tags').select('*').order('sort_order'),
    supabase.from('pb_synonyms').select('*').order('term'),
    supabase.from('pb_templates').select('*').order('name'),
    supabase
      .from('pb_config_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('pb_accounts').select('*').order('name'),
  ]);

  // Every one of these reads has to have succeeded. A page that is missing
  // half its tables is worse than a page that says the server is unwell.
  throwOnFirstError([
    roles,
    rolePermissions,
    profiles,
    userRoles,
    userAccounts,
    globalSettings,
    accountSettings,
    sections,
    nodeTypes,
    outcomes,
    tags,
    synonyms,
    templates,
    auditLog,
    accounts,
  ]);

  const roleIdsByUser = new Map<string, string[]>();
  for (const row of userRoles.data ?? []) {
    const list = roleIdsByUser.get(row.user_id as string) ?? [];
    list.push(row.role_id as string);
    roleIdsByUser.set(row.user_id as string, list);
  }

  const accountIdsByUser = new Map<string, string[]>();
  for (const row of userAccounts.data ?? []) {
    const list = accountIdsByUser.get(row.user_id as string) ?? [];
    list.push(row.account_id as string);
    accountIdsByUser.set(row.user_id as string, list);
  }

  const users: AdminUser[] = ((profiles.data ?? []) as any[]).map((profile) => ({
    id: profile.id as string,
    email: (profile.email as string) ?? null,
    display_name: (profile.display_name as string) ?? null,
    is_active: (profile.is_active as boolean) ?? true,
    last_login_at: (profile.last_login_at as string) ?? null,
    created_at: profile.created_at as string,
    role_ids: roleIdsByUser.get(profile.id as string) ?? [],
    account_ids: accountIdsByUser.get(profile.id as string) ?? [],
  }));

  return {
    roles: (roles.data ?? []) as Role[],
    rolePermissions: (rolePermissions.data ?? []) as RolePermission[],
    users,
    settings: (globalSettings.data?.settings ?? {}) as Record<string, unknown>,
    accountSettings: (accountSettings.data ?? []) as {
      account_id: string;
      settings: Record<string, unknown>;
    }[],
    sections: (sections.data ?? []) as SectionDefinition[],
    nodeTypes: (nodeTypes.data ?? []) as NodeType[],
    outcomes: (outcomes.data ?? []) as Outcome[],
    tags: (tags.data ?? []) as Tag[],
    synonyms: (synonyms.data ?? []) as Synonym[],
    templates: (templates.data ?? []) as ScenarioTemplate[],
    auditLog: (auditLog.data ?? []) as ConfigHistoryEntry[],
    accounts: (accounts.data ?? []) as Account[],
  };
}

/**
 * The list of permissions the matrix is built from.
 *
 * It lives in its own file because a component in the browser needs it and
 * this file talks to the database through the server client, which pulls in
 * next/headers. See permissions.ts for the reason.
 */
export { PERMISSION_CATALOG } from '@/lib/data/permissions';

/** The columns of the analytics dashboard. */
export interface AnalyticsData {
  topSearches: { query: string; count: number; result_count: number }[];
  zeroResultSearches: { query: string; count: number }[];
  mostHelpful: {
    id: string;
    title: string;
    slug: string;
    helpful: number;
    unhelpful: number;
  }[];
  staleScenarios: {
    id: string;
    title: string;
    slug: string;
    account_name: string | null;
    updated_at: string;
    days: number;
  }[];
  scenariosPerAccount: { account_name: string; count: number }[];
  scenariosPerCategory: { category_name: string; count: number }[];
  documentationGaps: {
    row_label: string;
    col_label: string;
    count: number;
  }[];
  mostFrequent: {
    id: string;
    title: string;
    slug: string;
    occurrence_count: number;
    account_name: string | null;
  }[];
  recentConfigChanges: ConfigHistoryEntry[];
  totalScenarios: number;
  publishedScenarios: number;
  draftScenarios: number;
  totalUsers: number;
}

export async function getAnalyticsData(
  staleThresholdDays = 180,
): Promise<AnalyticsData> {
  const supabase = createClient();

  const cutoff = new Date(
    Date.now() - staleThresholdDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    topSearches,
    zeroSearches,
    feedback,
    stale,
    scenarios,
    accounts,
    categories,
    gaps,
    frequent,
    configChanges,
    users,
  ] = await Promise.all([
    supabase
      .from('pb_search_log')
      .select('query, result_count, searched_at')
      .order('searched_at', { ascending: false })
      .limit(1000),
    supabase
      .from('pb_search_log')
      .select('query, result_count, searched_at')
      .eq('result_count', 0)
      .order('searched_at', { ascending: false })
      .limit(1000),
    supabase
      .from('pb_feedback')
      .select('scenario_id, is_helpful, pb_scenarios!inner(title, slug)')
      .limit(2000),
    supabase
      .from('pb_scenarios')
      .select('id, title, slug, updated_at, pb_accounts(name)')
      .is('deleted_at', null)
      .eq('status', 'published')
      .lt('updated_at', cutoff),
    supabase.from('pb_scenarios').select('id, title, slug, account_id, category_id, status, occurrence_count').is('deleted_at', null),
    supabase.from('pb_accounts').select('id, name'),
    supabase.from('pb_categories').select('id, name'),
    supabase.rpc('get_coverage_matrix', {
      p_row_field: 'category',
      p_col_field: 'account',
      p_account_ids: null,
    }),
    supabase
      .from('pb_scenarios')
      .select('id, title, slug, occurrence_count, pb_accounts(name)')
      .is('deleted_at', null)
      .eq('status', 'published')
      .order('occurrence_count', { ascending: false })
      .limit(10),
    supabase
      .from('pb_config_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('pb_user_profiles').select('id'),
  ]);

  // The dashboard counts are only meaningful if every one of them was read
  // cleanly; a partial read would show a wrong number rather than an error.
  throwOnFirstError([
    topSearches,
    zeroSearches,
    feedback,
    stale,
    scenarios,
    accounts,
    categories,
    gaps,
    frequent,
    configChanges,
    users,
  ]);

  // --- Aggregate the search log ---------------------------------------------
  const searchCount = new Map<string, number>();
  const zeroCount = new Map<string, number>();
  for (const row of topSearches.data ?? []) {
    const query = (row.query as string) ?? '';
    if (!query.trim()) continue;
    searchCount.set(query, (searchCount.get(query) ?? 0) + 1);
  }
  for (const row of zeroSearches.data ?? []) {
    const query = (row.query as string) ?? '';
    if (!query.trim()) continue;
    zeroCount.set(query, (zeroCount.get(query) ?? 0) + 1);
  }

  // --- Feedback -------------------------------------------------------------
  const feedbackByScenario = new Map<
    string,
    { title: string; slug: string; helpful: number; unhelpful: number }
  >();
  for (const row of feedback.data ?? []) {
    const scenario = row.pb_scenarios as unknown as
      | { title: string; slug: string }
      | { title: string; slug: string }[]
      | null;
    const info = Array.isArray(scenario) ? scenario[0] : scenario;
    if (!info) continue;
    const key = row.scenario_id as string;
    const entry = feedbackByScenario.get(key) ?? {
      title: info.title,
      slug: info.slug,
      helpful: 0,
      unhelpful: 0,
    };
    if (row.is_helpful) entry.helpful += 1;
    else entry.unhelpful += 1;
    feedbackByScenario.set(key, entry);
  }

  // --- Counts per account / category ----------------------------------------
  const accountNames = new Map(
    (accounts.data ?? []).map((a) => [a.id as string, a.name as string]),
  );
  const categoryNames = new Map(
    (categories.data ?? []).map((c) => [c.id as string, c.name as string]),
  );

  const perAccount = new Map<string, number>();
  const perCategory = new Map<string, number>();
  let published = 0;
  let draft = 0;

  for (const row of scenarios.data ?? []) {
    const accountId = row.account_id as string | null;
    if (accountId) {
      perAccount.set(accountId, (perAccount.get(accountId) ?? 0) + 1);
    }
    const categoryId = row.category_id as string | null;
    if (categoryId) {
      perCategory.set(categoryId, (perCategory.get(categoryId) ?? 0) + 1);
    }
    if (row.status === 'published') published += 1;
    if (row.status === 'draft' || row.status === 'pending_review') draft += 1;
  }

  // --- Documentation gaps: empty cells in the coverage matrix ----------------
  const gapRows = (gaps.data ?? []) as {
    row_label: string;
    col_label: string;
    count: number;
  }[];

  return {
    topSearches: Array.from(searchCount.entries())
      .map(([query, count]) => ({
        query,
        count,
        result_count: 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    zeroResultSearches: Array.from(zeroCount.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    mostHelpful: Array.from(feedbackByScenario.entries())
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => b.helpful - a.helpful)
      .slice(0, 10),
    staleScenarios: ((stale.data ?? []) as any[]).map((row) => {
      const account = row.pb_accounts as unknown as
        | { name: string }
        | { name: string }[]
        | null;
      const info = Array.isArray(account) ? account[0] : account;
      return {
        id: row.id as string,
        title: row.title as string,
        slug: row.slug as string,
        account_name: info?.name ?? null,
        updated_at: row.updated_at as string,
        days: Math.floor(
          (Date.now() - new Date(row.updated_at as string).getTime()) /
            86_400_000,
        ),
      };
    }),
    scenariosPerAccount: Array.from(perAccount.entries())
      .map(([accountId, count]) => ({
        account_name: accountNames.get(accountId) ?? 'Unknown',
        count,
      }))
      .sort((a, b) => b.count - a.count),
    scenariosPerCategory: Array.from(perCategory.entries())
      .map(([categoryId, count]) => ({
        category_name: categoryNames.get(categoryId) ?? 'Uncategorised',
        count,
      }))
      .sort((a, b) => b.count - a.count),
    documentationGaps: gapRows
      .filter((row) => row.count === 0)
      .slice(0, 20),
    mostFrequent: ((frequent.data ?? []) as any[]).map((row) => {
      const account = row.pb_accounts as unknown as
        | { name: string }
        | { name: string }[]
        | null;
      const info = Array.isArray(account) ? account[0] : account;
      return {
        id: row.id as string,
        title: row.title as string,
        slug: row.slug as string,
        occurrence_count: row.occurrence_count as number,
        account_name: info?.name ?? null,
      };
    }),
    recentConfigChanges: (configChanges.data ?? []) as ConfigHistoryEntry[],
    totalScenarios: (scenarios.data ?? []).length,
    publishedScenarios: published,
    draftScenarios: draft,
    totalUsers: (users.data ?? []).length,
  };
}
