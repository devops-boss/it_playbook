import { createClient } from '@/lib/supabase/client';
import * as core from '@/lib/data/criteria-core';
import type {
  FacetCount,
  FilterState,
  ScenarioCriteriaValue,
  SearchResult,
} from '@/types/database';

/**
 * The criteria queries, run from the browser.
 *
 * These are the ones a component in the browser calls when the person
 * searches, filters, or the list of results changes. They go through the
 * browser client, which holds the anon key and the person's own session
 * token, so the row level policies decide what comes back - the same as
 * on the server.
 *
 * The queries themselves live in `criteria-core.ts`; this file is only
 * the browser wrapper.
 */

/** The filter state a search starts from. */
export const DEFAULT_FILTERS = core.DEFAULT_FILTERS;

/** Map a sort option to what the RPC understands. */
export const sortToRpc = core.sortToRpc;

/** Run a search through the `search_scenarios` RPC. */
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

/** Custom criteria values for a batch of scenarios, keyed by scenario id. */
export async function getCriteriaValuesForScenarios(
  scenarioIds: string[],
): Promise<Record<string, ScenarioCriteriaValue[]>> {
  return core.getCriteriaValuesForScenarios(createClient(), scenarioIds);
}
