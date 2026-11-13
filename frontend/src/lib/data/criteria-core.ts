import type { SupabaseClient } from '@supabase/supabase-js';
import { toUpstreamError } from '@/lib/api-error';
import { isDocumentationPlaybook } from '@/lib/utils';
import type {
  CriteriaOption,
  FacetCount,
  FilterState,
  Scenario,
  ScenarioCriteriaValue,
  SearchResult,
  SortOption,
} from '@/types/database';

/**
 * The criteria queries, written once and used from both sides.
 *
 * Every function here takes the Supabase client as an argument. That is
 * what lets the same query run in a Server Component (with the session
 * cookie) and in a component in the browser (with the session token),
 * without a copy of the logic in each place and without the server-only
 * modules being pulled into the browser bundle.
 *
 * The client is always the *user's* client - the anon key plus the
 * person's own session. The service role key is never used anywhere in
 * the application; what a person may see is decided by the row level
 * policies and by the permission checks inside the RPCs.
 */

/** The filter state a search starts from. */
export const DEFAULT_FILTERS: FilterState = {
  query: '',
  accountIds: [],
  accountMatch: 'any',
  categoryIds: [],
  issueTypeIds: [],
  severityIds: [],
  impactScopeIds: [],
  custom: {},
  sort: 'relevance',
  page: 1,
  pageSize: 25,
};

/** Map a sort option to what the RPC understands. */
export function sortToRpc(sort: SortOption): string {
  switch (sort) {
    case 'frequency':
      return 'frequency';
    case 'newest':
      return 'newest';
    case 'oldest':
      return 'oldest';
    case 'title':
      return 'title';
    default:
      return 'relevance';
  }
}

/**
 * Run a search through the `search_scenarios` RPC.
 *
 * The RPC handles full-text search, trigram typo tolerance, account match
 * modes, system criteria filters and custom EAV filters, and returns the
 * total count for pagination.
 */
export async function searchScenarios(
  supabase: SupabaseClient,
  filters: Partial<FilterState>,
): Promise<{ results: SearchResult[]; total: number }> {
  const f = { ...DEFAULT_FILTERS, ...filters };

  const { data, error } = await supabase.rpc('search_scenarios', {
    p_query: f.query.trim() || null,
    p_account_ids: f.accountIds.length > 0 ? f.accountIds : null,
    p_account_match: f.accountMatch,
    p_category_ids: f.categoryIds.length > 0 ? f.categoryIds : null,
    p_issue_type_ids: f.issueTypeIds.length > 0 ? f.issueTypeIds : null,
    p_severity_ids: f.severityIds.length > 0 ? f.severityIds : null,
    p_impact_scope_ids: f.impactScopeIds.length > 0 ? f.impactScopeIds : null,
    p_custom_filters: Object.keys(f.custom).length > 0 ? f.custom : null,
    p_sort: f.sort,
    p_limit: f.pageSize,
    p_offset: (f.page - 1) * f.pageSize,
  });

  if (error) throw toUpstreamError(error);

  const rows = (data ?? []) as SearchResult[];
  return { results: rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

/** Live facet counts for all active criteria fields. */
export async function getFacetCounts(supabase: SupabaseClient): Promise<FacetCount[]> {
  const { data, error } = await supabase.rpc('get_facet_counts', {
    p_account_ids: null,
    p_category_ids: null,
  });
  if (error) throw toUpstreamError(error);
  return (data ?? []) as FacetCount[];
}

/** Options for many fields at once, keyed by field id. */
export async function getOptionsForFields(
  supabase: SupabaseClient,
  fieldIds: string[],
): Promise<Record<string, CriteriaOption[]>> {
  if (fieldIds.length === 0) return {} as Record<string, CriteriaOption[]>;

  const { data, error } = await supabase
    .from('pb_criteria_options')
    .select('*')
    .in('field_id', fieldIds)
    .order('sort_order', { ascending: true });

  if (error) throw toUpstreamError(error);

  const grouped: Record<string, CriteriaOption[]> = {};
  for (const option of (data ?? []) as CriteriaOption[]) {
    (grouped[option.field_id] ??= []).push(option);
  }
  return grouped;
}

/** Option labels for a set of field ids, as a flat id -> option map. */
export async function getOptionsMap(
  supabase: SupabaseClient,
  fieldIds: string[],
): Promise<{ grouped: Record<string, CriteriaOption[]>; map: Map<string, CriteriaOption> }> {
  const grouped = await getOptionsForFields(supabase, fieldIds);
  const map = new Map<string, CriteriaOption>();
  for (const list of Object.values(grouped)) {
    for (const option of list) map.set(option.id, option);
  }
  return { grouped, map };
}

/**
 * Custom criteria values for a batch of scenarios, keyed by scenario id.
 *
 * The search RPC returns system criteria as columns but not the EAV rows,
 * so the card layer fetches them in one round trip.
 */
export async function getCriteriaValuesForScenarios(
  supabase: SupabaseClient,
  scenarioIds: string[],
): Promise<Record<string, ScenarioCriteriaValue[]>> {
  if (scenarioIds.length === 0) return {};

  const { data, error } = await supabase
    .from('pb_scenario_criteria_values')
    .select('*')
    .in('scenario_id', scenarioIds);

  if (error) throw toUpstreamError(error);

  const grouped: Record<string, ScenarioCriteriaValue[]> = {};
  for (const value of (data ?? []) as ScenarioCriteriaValue[]) {
    (grouped[value.scenario_id] ??= []).push(value);
  }
  return grouped;
}

export interface PlaybookMeta {
  isDocumentation: boolean;
  tags: string[];
}

/**
 * Fetch playbook metadata (documentation vs scenario, tags) for a batch of scenarios.
 */
export async function getPlaybookMetaMap(
  supabase: SupabaseClient,
  scenarioIds: string[],
): Promise<Record<string, PlaybookMeta>> {
  if (scenarioIds.length === 0) return {};

  const { data, error } = await supabase
    .from('pb_scenarios')
    .select('id, tags, custom_sections')
    .in('id', scenarioIds);

  if (error) {
    console.error('Failed to fetch playbook meta map', error);
    return {};
  }

  const map: Record<string, PlaybookMeta> = {};
  for (const row of data ?? []) {
    map[row.id] = {
      isDocumentation: isDocumentationPlaybook(row),
      tags: row.tags ?? [],
    };
  }
  return map;
}

/**
 * Fetch published documentation & SOP playbooks for the knowledge base.
 */
export async function getDocumentationPlaybooks(
  supabase: SupabaseClient,
  limit = 8,
): Promise<Scenario[]> {
  const { data, error } = await supabase
    .from('pb_scenarios')
    .select('*')
    .is('deleted_at', null)
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .limit(limit * 3);

  if (error) {
    console.error('Failed to fetch documentation playbooks', error);
    return [];
  }

  const docs = ((data ?? []) as Scenario[]).filter((s) => isDocumentationPlaybook(s));
  return docs.slice(0, limit);
}
