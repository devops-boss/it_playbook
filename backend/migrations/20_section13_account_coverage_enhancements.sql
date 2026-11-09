-- ============================================================================
-- Section 13: Account Views & Coverage Matrix Enhancements
-- Big Outsource IT Operations Playbook
-- ============================================================================

-- 1. Ensure internet-down-isp-failover is marked as a Global SOP
-- This ensures all 26 Big Outsource client accounts have immediate access to the standard failover playbook
UPDATE pb_scenarios
SET is_global = TRUE
WHERE slug = 'internet-down-isp-failover';

-- 2. Drop and recreate get_account_playbook with support for:
-- - pb_scenario_accounts mapping
-- - quick_fix and sample_ticket_ids projections
-- - new filter tabs: account_only, global_only, critical, frequent
DROP FUNCTION IF EXISTS get_account_playbook(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_account_playbook(
  p_account_id UUID,
  p_view TEXT DEFAULT 'all'
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  summary TEXT,
  quick_fix TEXT,
  sample_ticket_ids TEXT[],
  category_id UUID,
  category_name TEXT,
  category_color TEXT,
  issue_type_id UUID,
  issue_type_label TEXT,
  issue_type_color TEXT,
  severity_id UUID,
  severity_label TEXT,
  severity_color TEXT,
  impact_scope_id UUID,
  impact_scope_label TEXT,
  occurrence_count INT,
  is_global BOOLEAN,
  is_pinned BOOLEAN,
  updated_at TIMESTAMPTZ,
  last_occurred_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.title, s.slug, s.summary,
    s.quick_fix,
    ARRAY(
      SELECT tk.ticket_id
      FROM pb_sample_tickets tk
      WHERE tk.scenario_id = s.id
      ORDER BY tk.created_at DESC
      LIMIT 5
    ) AS sample_ticket_ids,
    s.category_id, c.name, c.color,
    s.issue_type_id, it.label, it.color,
    s.severity_id, sv.label, sv.color,
    s.impact_scope_id, isc.label,
    s.occurrence_count, s.is_global, s.is_pinned,
    s.updated_at, s.last_occurred_at
  FROM pb_scenarios s
  LEFT JOIN pb_categories c ON c.id = s.category_id
  LEFT JOIN pb_criteria_options it ON it.id = s.issue_type_id
  LEFT JOIN pb_criteria_options sv ON sv.id = s.severity_id
  LEFT JOIN pb_criteria_options isc ON isc.id = s.impact_scope_id
  WHERE s.deleted_at IS NULL
    AND s.status = 'published'
    AND (
      s.is_global = TRUE
      OR s.account_id = p_account_id
      OR EXISTS (
        SELECT 1 FROM pb_scenario_accounts sa
        WHERE sa.scenario_id = s.id AND sa.account_id = p_account_id
      )
    )
    AND (
      p_view = 'all'
      OR (p_view = 'frequent' AND (it.value = 'frequent' OR s.occurrence_count >= 2))
      OR (p_view = 'anticipated' AND it.value = 'anticipated')
      OR (p_view = 'critical' AND (sv.value IN ('high','critical') OR sv.label IN ('High','Critical')))
      OR (p_view = 'account_only' AND s.is_global = FALSE)
      OR (p_view = 'global_only' AND s.is_global = TRUE)
      OR (p_view = 'by_category')
    )
  ORDER BY s.is_pinned DESC, s.occurrence_count DESC, s.updated_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Account metrics summary for individual account page
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
  RETURN QUERY
  SELECT
    a.id AS account_id,
    a.name AS account_name,
    a.code AS account_code,
    a.accent_color,
    count(DISTINCT s.id)::BIGINT AS total_playbooks,
    count(DISTINCT CASE WHEN s.is_global = FALSE THEN s.id END)::BIGINT AS account_specific_playbooks,
    count(DISTINCT CASE WHEN s.is_global = TRUE THEN s.id END)::BIGINT AS global_playbooks,
    coalesce(sum(s.occurrence_count), 0)::BIGINT AS total_occurrences,
    count(DISTINCT s.category_id)::BIGINT AS categories_covered,
    max(s.updated_at) AS last_updated_at
  FROM pb_accounts a
  LEFT JOIN pb_scenarios s ON s.deleted_at IS NULL AND s.status = 'published' AND (
    s.is_global = TRUE
    OR s.account_id = a.id
    OR EXISTS (SELECT 1 FROM pb_scenario_accounts sa WHERE sa.scenario_id = s.id AND sa.account_id = a.id)
  )
  WHERE a.id = p_account_id
  GROUP BY a.id, a.name, a.code, a.accent_color;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. Batch account metrics for the 26 accounts directory (/accounts)
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
  SELECT
    a.id AS account_id,
    a.name AS account_name,
    a.code AS account_code,
    a.accent_color,
    a.description,
    a.status,
    count(DISTINCT s.id)::BIGINT AS total_playbooks,
    count(DISTINCT CASE WHEN s.is_global = FALSE THEN s.id END)::BIGINT AS account_specific_playbooks,
    count(DISTINCT CASE WHEN s.is_global = TRUE THEN s.id END)::BIGINT AS global_playbooks,
    coalesce(sum(s.occurrence_count), 0)::BIGINT AS total_occurrences,
    count(DISTINCT s.category_id)::BIGINT AS categories_covered,
    max(s.updated_at) AS last_updated_at
  FROM pb_accounts a
  LEFT JOIN pb_scenarios s ON s.deleted_at IS NULL AND s.status = 'published' AND (
    s.is_global = TRUE
    OR s.account_id = a.id
    OR EXISTS (SELECT 1 FROM pb_scenario_accounts sa WHERE sa.scenario_id = s.id AND sa.account_id = a.id)
  )
  GROUP BY a.id, a.name, a.code, a.accent_color, a.description, a.status
  ORDER BY a.name ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. Grant permissions to authenticated, anon, and service_role
GRANT EXECUTE ON FUNCTION get_account_playbook(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_account_metrics(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_all_account_metrics() TO authenticated, anon, service_role;
