import { createClient } from '@/lib/supabase/server';
import { throwOnFirstError, toUpstreamError } from '@/lib/api-error';
import * as core from '@/lib/data/criteria-core';
import type {
  Account,
  Category,
  CriteriaField,
  CriteriaOption,
  FacetCount,
  FilterState,
  Scenario,
  ScenarioCriteriaValue,
  SearchResult,
} from '@/types/database';

/**
 * Data access for the criteria-driven surfaces, on the server.
 *
 * Every function here reads the criteria DEFINITIONS at runtime. Adding a
 * field in the admin UI makes it appear in facets, the editor and filters
 * with no code change.
 *
 * The queries themselves are in `criteria-core.ts`, so that the same
 * query can be run from a Server Component (with the session cookie) and
 * from a component in the browser (with the session token). This file
 * holds the server wrappers; `criteria-client.ts` holds the browser ones.
 */

/** The filter state a search starts from. */
export const DEFAULT_FILTERS = core.DEFAULT_FILTERS;

/** Map a sort option to what the RPC understands. */
export const sortToRpc = core.sortToRpc;

/** All active criteria fields that apply to scenarios, in display order. */
export async function getCriteriaFields(appliesTo: 'scenarios' | 'playbooks' = 'scenarios') {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_criteria_definitions', {
    p_applies_to: appliesTo,
  });
  if (error) throw toUpstreamError(error);
  return (data ?? []) as CriteriaField[];
}

/** Options for one criteria field, including inactive ones (for display). */
export async function getCriteriaOptions(fieldId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_criteria_options', {
    p_field_id: fieldId,
  });
  if (error) throw toUpstreamError(error);
  return (data ?? []) as CriteriaOption[];
}

/** Accounts the current user can see, optionally including archived. */
export async function getAccounts(includeArchived = false) {
  const supabase = createClient();
  let query = supabase.from('pb_accounts').select('*').order('name');
  if (!includeArchived) query = query.neq('status', 'Archived');
  const { data, error } = await query;
  if (error) throw toUpstreamError(error);
  return (data ?? []) as Account[];
}

/** The full category tree, active only unless asked otherwise. */
export async function getCategories(includeInactive = false) {
  const supabase = createClient();
  let query = supabase.from('pb_categories').select('*').order('sort_order');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw toUpstreamError(error);
  return (data ?? []) as Category[];
}

/**
 * Run a search through the `search_scenarios` RPC.
 *
 * The RPC handles full-text search, trigram typo tolerance, account match
 * modes, system criteria filters and custom EAV filters, and returns the
 * total count for pagination.
 */
export async function searchScenarios(filters: Partial<FilterState>): Promise<{
  results: SearchResult[];
  total: number;
}> {
  return core.searchScenarios(createClient(), filters);
}

/** Live facet counts for all active criteria fields. */
export async function getFacetCounts(): Promise<FacetCount[]> {
  return core.getFacetCounts(createClient());
}

/** Options for many fields at once, keyed by field id. */
export async function getOptionsForFields(fieldIds: string[]) {
  return core.getOptionsForFields(createClient(), fieldIds);
}

/** Option labels for a set of field ids, as a flat id -> option map. */
export async function getOptionsMap(fieldIds: string[]) {
  return core.getOptionsMap(createClient(), fieldIds);
}

/**
 * Custom criteria values for a batch of scenarios, keyed by scenario id.
 */
export async function getCriteriaValuesForScenarios(
  scenarioIds: string[],
): Promise<Record<string, ScenarioCriteriaValue[]>> {
  return core.getCriteriaValuesForScenarios(createClient(), scenarioIds);
}

/** A single scenario with all of its relations, for the reader view. */
export async function getScenario(slug: string) {
  const supabase = createClient();

  const { data: scenario, error: scenarioError } = await supabase
    .from('pb_scenarios')
    .select('*')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (scenarioError) throw toUpstreamError(scenarioError);
  if (!scenario) return null;

  const [tickets, attachments, related, criteriaValues, flowchart] = await Promise.all([
    supabase
      .from('pb_sample_tickets')
      .select('*')
      .eq('scenario_id', scenario.id)
      .order('ticket_date', { ascending: false }),
    supabase.from('pb_attachments').select('*').eq('scenario_id', scenario.id),
    supabase
      .from('pb_related_scenarios')
      .select('related_scenario_id, relation_type')
      .eq('scenario_id', scenario.id),
    supabase.from('pb_scenario_criteria_values').select('*').eq('scenario_id', scenario.id),
    supabase.from('pb_flowcharts').select('*').eq('scenario_id', scenario.id).maybeSingle(),
  ]);

  throwOnFirstError([tickets, attachments, related, criteriaValues, flowchart]);

  return {
    scenario: scenario as Scenario,
    tickets: tickets.data ?? [],
    attachments: attachments.data ?? [],
    related: related.data ?? [],
    criteriaValues: criteriaValues.data ?? [],
    flowchart: flowchart.data ?? null,
  };
}

/** Scenarios linked to one or more accounts. */
export async function getScenariosForAccounts(accountIds: string[], limit = 200) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('pb_scenarios')
    .select('*')
    .is('deleted_at', null)
    .eq('status', 'published')
    .in('account_id', accountIds)
    .order('occurrence_count', { ascending: false })
    .limit(limit);
  if (error) throw toUpstreamError(error);
  return (data ?? []) as Scenario[];
}

/** Recently updated published scenarios. */
export async function getRecentlyUpdated(limit = 10) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('pb_scenarios')
    .select('*')
    .is('deleted_at', null)
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw toUpstreamError(error);
  return (data ?? []) as Scenario[];
}

/** Scenarios the user has recently viewed. */
export async function getRecentlyViewed(userId: string, limit = 10) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('pb_view_history')
    .select('scenario_id, viewed_at')
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .limit(limit);
  if (error) throw toUpstreamError(error);
  return data ?? [];
}

/** The user's favorite scenarios. */
export async function getFavorites(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('pb_favorites')
    .select('scenario_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw toUpstreamError(error);
  return data ?? [];
}

/** Scenarios matching a criteria filter, used by Smart Playbooks. */
export async function getSmartPlaybookScenarios(filter: Record<string, unknown>, limit = 100) {
  const supabase = createClient();

  // Smart filters reuse the search RPC so a smart playbook is always live.
  const { data, error } = await supabase.rpc('search_scenarios', {
    p_query: (filter.query as string) ?? null,
    p_account_ids: (filter.accountIds as string[]) ?? null,
    p_account_match: (filter.accountMatch as string) ?? 'any',
    p_category_ids: (filter.categoryIds as string[]) ?? null,
    p_issue_type_ids: (filter.issueTypeIds as string[]) ?? null,
    p_severity_ids: (filter.severityIds as string[]) ?? null,
    p_impact_scope_ids: (filter.impactScopeIds as string[]) ?? null,
    p_custom_filters: (filter.custom as Record<string, string[]>) ?? null,
    p_sort: 'frequency',
    p_limit: limit,
    p_offset: 0,
  });

  if (error) throw toUpstreamError(error);
  return (data ?? []) as SearchResult[];
}

/** Log a search for the analytics dashboard (zero-result tracking). */
export async function logSearch(
  userId: string | null,
  query: string,
  resultCount: number,
  filters?: Record<string, unknown>,
) {
  const supabase = createClient();
  await supabase.from('pb_search_log').insert({
    user_id: userId,
    query,
    result_count: resultCount,
    filters: filters ?? {},
  });
}
