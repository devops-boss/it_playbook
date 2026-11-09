import { createClient } from '@/lib/supabase/server';
import { toUpstreamError } from '@/lib/api-error';
import type { CoverageCell } from '@/types/database';

/**
 * The coverage matrix for any two criteria dimensions.
 *
 * The RPC builds the axes dynamically, so a custom criteria field works
 * as a matrix dimension without any code change.
 */
export async function getCoverageMatrix(
  rowField: string,
  colField: string,
  accountIds?: string[],
): Promise<CoverageCell[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_coverage_matrix', {
    p_row_field: rowField,
    p_col_field: colField,
    p_account_ids: accountIds && accountIds.length > 0 ? accountIds : null,
  });
  if (error) throw toUpstreamError(error);
  return (data ?? []) as CoverageCell[];
}
