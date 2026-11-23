-- ============================================================================
-- Migration 28: Fix get_all_account_metrics & get_account_metrics
--
-- 1. get_all_account_metrics(): Wraps UNION ALL in an outer query
--    (SELECT * FROM (...) combined) so PostgreSQL allows ordering by CASE
--    expression without syntax/group-by errors.
-- 2. get_account_metrics(): Handles both the virtual GLOBAL account
--    ('00000000-0000-0000-0000-000000000000') and regular client accounts,
--    reporting true counts for global playbooks and account-specific playbooks.
-- ============================================================================

DROP FUNCTION IF EXISTS get_all_account_metrics();

CREATE OR REPLACE FUNCTION get_all_account_metrics()
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  account_code TEXT,
  accent_color TEXT,
  description TEXT,
  status TEXT,
  total_playbooks BIGINT,
  account_specific_playbooks BIGINT,
  global_playbooks BIGINT,
  total_occurrences BIGINT,
  categories_covered BIGINT,
  last_updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    -- 1. First row: The dedicated "Global Scenarios" virtual account entry
    SELECT
      '00000000-0000-0000-0000-000000000000'::UUID AS account_id,
      'Global Scenarios'::TEXT AS account_name,
      'GLOBAL'::TEXT AS account_code,
      '#0284c7'::TEXT AS accent_color,
      'Universal standard operating procedures, global IT policies, and organization-wide playbooks.'::TEXT AS description,
      'Active'::TEXT AS status,
      count(DISTINCT s.id)::BIGINT AS total_playbooks,
      0::BIGINT AS account_specific_playbooks,
      count(DISTINCT s.id)::BIGINT AS global_playbooks,
      coalesce(sum(s.occurrence_count), 0)::BIGINT AS total_occurrences,
      count(DISTINCT s.category_id)::BIGINT AS categories_covered,
      max(s.updated_at) AS last_updated_at
    FROM pb_scenarios s
    WHERE s.deleted_at IS NULL AND s.status = 'published' AND (s.is_global = TRUE OR s.account_id IS NULL)

    UNION ALL

    -- 2. Subsequent rows: Specific client accounts (showing ONLY their account-specific playbooks)
    SELECT
      a.id AS account_id,
      a.name AS account_name,
      a.code AS account_code,
      a.accent_color,
      a.description,
      a.status,
      count(DISTINCT s.id)::BIGINT AS total_playbooks,
      count(DISTINCT s.id)::BIGINT AS account_specific_playbooks,
      0::BIGINT AS global_playbooks,
      coalesce(sum(s.occurrence_count), 0)::BIGINT AS total_occurrences,
      count(DISTINCT s.category_id)::BIGINT AS categories_covered,
      max(s.updated_at) AS last_updated_at
    FROM pb_accounts a
    LEFT JOIN pb_scenarios s ON s.deleted_at IS NULL AND s.status = 'published' AND (
      s.account_id = a.id
      OR EXISTS (SELECT 1 FROM pb_scenario_accounts sa WHERE sa.scenario_id = s.id AND sa.account_id = a.id)
    )
    GROUP BY a.id, a.name, a.code, a.accent_color, a.description, a.status
  ) combined
  ORDER BY (CASE WHEN combined.account_code = 'GLOBAL' THEN 0 ELSE 1 END), combined.account_name ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


DROP FUNCTION IF EXISTS get_account_metrics(UUID);

CREATE OR REPLACE FUNCTION get_account_metrics(p_account_id UUID)
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  account_code TEXT,
  accent_color TEXT,
  total_playbooks BIGINT,
  account_specific_playbooks BIGINT,
  global_playbooks BIGINT,
  total_occurrences BIGINT,
  categories_covered BIGINT,
  last_updated_at TIMESTAMPTZ
) AS $$
BEGIN
  IF p_account_id = '00000000-0000-0000-0000-000000000000'::UUID THEN
    RETURN QUERY
    SELECT
      '00000000-0000-0000-0000-000000000000'::UUID AS account_id,
      'Global Scenarios'::TEXT AS account_name,
      'GLOBAL'::TEXT AS account_code,
      '#0284c7'::TEXT AS accent_color,
      count(DISTINCT s.id)::BIGINT AS total_playbooks,
      0::BIGINT AS account_specific_playbooks,
      count(DISTINCT s.id)::BIGINT AS global_playbooks,
      coalesce(sum(s.occurrence_count), 0)::BIGINT AS total_occurrences,
      count(DISTINCT s.category_id)::BIGINT AS categories_covered,
      max(s.updated_at) AS last_updated_at
    FROM pb_scenarios s
    WHERE s.deleted_at IS NULL AND s.status = 'published' AND (s.is_global = TRUE OR s.account_id IS NULL);
  ELSE
    RETURN QUERY
    SELECT
      a.id AS account_id,
      a.name AS account_name,
      a.code AS account_code,
      a.accent_color,
      count(DISTINCT s.id)::BIGINT AS total_playbooks,
      count(DISTINCT s.id)::BIGINT AS account_specific_playbooks,
      0::BIGINT AS global_playbooks,
      coalesce(sum(s.occurrence_count), 0)::BIGINT AS total_occurrences,
      count(DISTINCT s.category_id)::BIGINT AS categories_covered,
      max(s.updated_at) AS last_updated_at
    FROM pb_accounts a
    LEFT JOIN pb_scenarios s ON s.deleted_at IS NULL AND s.status = 'published' AND (
      s.account_id = a.id
      OR EXISTS (SELECT 1 FROM pb_scenario_accounts sa WHERE sa.scenario_id = s.id AND sa.account_id = a.id)
    )
    WHERE a.id = p_account_id
    GROUP BY a.id, a.name, a.code, a.accent_color;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_all_account_metrics() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_account_metrics(UUID) TO authenticated, anon, service_role;
