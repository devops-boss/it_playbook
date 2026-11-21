-- ============================================================================
-- 25_fix_storage_and_account_scenarios.sql
-- 1. Fix storage database permissions & instant RLS policies
-- 2. Dedup global scenarios: Create first-class 'Global Scenarios' view (positioned first)
--    and remove redundant global scenarios from specific client accounts.
-- ============================================================================

-- 1. STORAGE SERVICE PERMISSIONS & ROLES
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    ALTER ROLE supabase_storage_admin WITH LOGIN;
  END IF;
END $$;

GRANT ALL PRIVILEGES ON SCHEMA storage TO supabase_storage_admin, supabase_admin, postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA storage TO supabase_storage_admin, supabase_admin, postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA storage TO supabase_storage_admin, supabase_admin, postgres;

-- Ensure bucket scenario-attachments is fully unlocked
INSERT INTO storage.buckets (id, name, owner, owner_id, public, allowed_mime_types, file_size_limit)
VALUES ('scenario-attachments', 'scenario-attachments', NULL, NULL, FALSE, NULL, 104857600)
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = NULL,
  file_size_limit = 104857600;

-- Instant RLS policies on storage.objects for fast concurrent uploads and downloads
DROP POLICY IF EXISTS "attachment upload allowed for scenario editors" ON storage.objects;
CREATE POLICY "attachment upload allowed for scenario editors" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'scenario-attachments'
);

DROP POLICY IF EXISTS "attachment read allowed for scenario viewers" ON storage.objects;
CREATE POLICY "attachment read allowed for scenario viewers" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'scenario-attachments'
);

DROP POLICY IF EXISTS "attachment update allowed for scenario editors" ON storage.objects;
CREATE POLICY "attachment update allowed for scenario editors" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'scenario-attachments'
);

DROP POLICY IF EXISTS "attachment delete allowed for scenario editors" ON storage.objects;
CREATE POLICY "attachment delete allowed for scenario editors" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'scenario-attachments'
);


-- 2. SEPARATE GLOBAL SCENARIOS FROM SPECIFIC ACCOUNTS
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
DECLARE
  v_is_global_view BOOLEAN;
BEGIN
  -- Global view if account_id is null or the 00000000-0000-0000-0000-000000000000 sentinel
  v_is_global_view := (p_account_id IS NULL OR p_account_id = '00000000-0000-0000-0000-000000000000'::UUID);

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
      -- Global view: ONLY show global scenarios
      (v_is_global_view AND s.is_global = TRUE)
      OR
      -- Specific account view: ONLY show scenarios specifically assigned to this account
      (NOT v_is_global_view AND (
        s.account_id = p_account_id
        OR EXISTS (
          SELECT 1 FROM pb_scenario_accounts sa
          WHERE sa.scenario_id = s.id AND sa.account_id = p_account_id
        )
      ))
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


-- 3. BATCH ACCOUNT METRICS WITH GLOBAL SCENARIOS POSITIONED FIRST
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
  WHERE s.deleted_at IS NULL AND s.status = 'published' AND s.is_global = TRUE

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
  ORDER BY (CASE WHEN account_code = 'GLOBAL' THEN 0 ELSE 1 END), account_name ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_account_playbook(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_all_account_metrics() TO authenticated, anon, service_role;

