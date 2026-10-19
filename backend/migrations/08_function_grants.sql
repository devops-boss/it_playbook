-- ============================================================================
-- BOS Playbook - Function EXECUTE Grants
--
-- Separate from 06_rls.sql because these functions are created in
-- 07_seed_criteria.sql, which runs after the RLS policies.
-- ============================================================================

GRANT EXECUTE ON FUNCTION search_scenarios(TEXT, UUID[], TEXT, UUID[], UUID[], UUID[], UUID[], JSONB, TEXT, INT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_facet_counts(UUID[], UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_coverage_matrix(TEXT, TEXT, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_account_playbook(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_category_playbook(UUID, UUID[], TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_criteria_definitions(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_criteria_options(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_config_impact(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION export_config() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION has_permission(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION has_account_access(UUID) TO authenticated, service_role;

-- Mutation RPCs: restricted to the roles that hold the matching permission.
-- These are SECURITY DEFINER, so the guard must be inside the function.
GRANT EXECUTE ON FUNCTION bulk_update_scenario_criteria(UUID[], JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION merge_accounts(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION merge_categories(UUID, UUID) TO authenticated, service_role;
