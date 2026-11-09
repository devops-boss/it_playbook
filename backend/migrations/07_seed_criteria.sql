-- ============================================================================
-- BOS Playbook - Default Criteria Definitions & Supporting Functions
-- ============================================================================

-- ============================================================================
-- Default system criteria fields
-- These are the "built-in" fields. Admins can rename, reorder, change required
-- status, and edit their option lists -- but cannot delete them.
-- ============================================================================
INSERT INTO pb_criteria_fields (key, label, description, type, applies_to, is_required, show_as_facet, show_on_card, sort_order, is_system, is_active)
VALUES
  ('account', 'Account(s)', 'Client accounts this scenario applies to. Use "Global" for all accounts.', 'multi-select', 'both', TRUE, TRUE, TRUE, 1, TRUE, TRUE),
  ('category', 'Problem Category', 'Hierarchical problem classification.', 'hierarchical-select', 'both', TRUE, TRUE, TRUE, 2, TRUE, TRUE),
  ('issue_type', 'Issue Type', 'Frequent/Known, Anticipated/Potential, or One-off/Resolved.', 'single-select', 'both', TRUE, TRUE, TRUE, 3, TRUE, TRUE),
  ('severity', 'Severity', 'Impact severity level.', 'single-select', 'both', TRUE, TRUE, TRUE, 4, TRUE, TRUE),
  ('impact_scope', 'Impact Scope', 'How many users are affected.', 'single-select', 'both', TRUE, TRUE, TRUE, 5, TRUE, TRUE),
  ('platform', 'Platform/Tool', 'Specific application or tool involved.', 'single-select', 'both', FALSE, TRUE, TRUE, 6, TRUE, TRUE),
  ('site', 'Site/Location', 'Physical office or site.', 'single-select', 'both', FALSE, TRUE, FALSE, 7, TRUE, TRUE),
  ('work_setup', 'Work Setup', 'On-site, WFH, or Hybrid.', 'single-select', 'both', FALSE, TRUE, FALSE, 8, TRUE, TRUE),
  ('frequency', 'Frequency', 'How often the issue occurs.', 'single-select', 'both', FALSE, TRUE, FALSE, 9, TRUE, TRUE),
  ('vendor', 'Vendor/ISP', 'Internet service provider or vendor.', 'single-select', 'both', FALSE, TRUE, FALSE, 10, TRUE, TRUE)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- Issue Type options (system field)
-- ============================================================================
INSERT INTO pb_criteria_options (field_id, label, value, color, sort_order)
SELECT cf.id, o.label, o.value, o.color, o.sort_order
FROM (VALUES
  ('Frequent/Known', 'frequent', '#ef4444', 1),
  ('Anticipated/Potential', 'anticipated', '#f59e0b', 2),
  ('One-off/Resolved Incident', 'one_off', '#3b82f6', 3)
) AS o(label, value, color, sort_order)
CROSS JOIN pb_criteria_fields cf
WHERE cf.key = 'issue_type'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Severity options (system field)
-- ============================================================================
INSERT INTO pb_criteria_options (field_id, label, value, color, sort_order)
SELECT cf.id, o.label, o.value, o.color, o.sort_order
FROM (VALUES
  ('Low', 'low', '#10b981', 1),
  ('Medium', 'medium', '#f59e0b', 2),
  ('High', 'high', '#f97316', 3),
  ('Critical', 'critical', '#ef4444', 4)
) AS o(label, value, color, sort_order)
CROSS JOIN pb_criteria_fields cf
WHERE cf.key = 'severity'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Impact Scope options (system field)
-- ============================================================================
INSERT INTO pb_criteria_options (field_id, label, value, color, sort_order)
SELECT cf.id, o.label, o.value, o.color, o.sort_order
FROM (VALUES
  ('Single user', 'single_user', '#64748b', 1),
  ('Team', 'team', '#0ea5e9', 2),
  ('Site', 'site', '#8b5cf6', 3),
  ('Account-wide', 'account_wide', '#d946ef', 4),
  ('Company-wide', 'company_wide', '#dc2626', 5)
) AS o(label, value, color, sort_order)
CROSS JOIN pb_criteria_fields cf
WHERE cf.key = 'impact_scope'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Work Setup options (system field)
-- ============================================================================
INSERT INTO pb_criteria_options (field_id, label, value, color, sort_order)
SELECT cf.id, o.label, o.value, o.color, o.sort_order
FROM (VALUES
  ('On-site', 'on_site', '#f97316', 1),
  ('WFH', 'wfh', '#8b5cf6', 2),
  ('Hybrid', 'hybrid', '#06b6d4', 3)
) AS o(label, value, color, sort_order)
CROSS JOIN pb_criteria_fields cf
WHERE cf.key = 'work_setup'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Frequency options (system field)
-- ============================================================================
INSERT INTO pb_criteria_options (field_id, label, value, color, sort_order)
SELECT cf.id, o.label, o.value, o.color, o.sort_order
FROM (VALUES
  ('Multiple times daily', 'daily', '#dc2626', 1),
  ('Weekly', 'weekly', '#f97316', 2),
  ('Monthly', 'monthly', '#f59e0b', 3),
  ('Quarterly', 'quarterly', '#0ea5e9', 4),
  ('Rare/One-off', 'rare', '#64748b', 5)
) AS o(label, value, color, sort_order)
CROSS JOIN pb_criteria_fields cf
WHERE cf.key = 'frequency'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Platform/Tool options (system field) - examples, admin-extensible
-- ============================================================================
INSERT INTO pb_criteria_options (field_id, label, value, color, sort_order)
SELECT cf.id, o.label, o.value, o.color, o.sort_order
FROM (VALUES
  ('Microsoft Teams', 'ms_teams', '#6264a7', 1),
  ('Softphone-Dialer', 'softphone', '#0f9d58', 2),
  ('CRM', 'crm', '#f59e0b', 3),
  ('Web Browser', 'browser', '#3b82f6', 4),
  ('VDI-Citrix', 'vdi', '#16a34a', 5),
  ('Outlook', 'outlook', '#0078d4', 6),
  ('Avaya', 'avaya', '#dc2626', 7)
) AS o(label, value, color, sort_order)
CROSS JOIN pb_criteria_fields cf
WHERE cf.key = 'platform'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Default category tree
-- ============================================================================
INSERT INTO pb_categories (name, slug, parent_id, icon, color, sort_order)
VALUES
  ('Network Troubleshooting', 'network-troubleshooting', NULL, 'wifi', '#0ea5e9', 1),
  ('App Troubleshooting', 'app-troubleshooting', NULL, 'app-window', '#8b5cf6', 2),
  ('Hardware', 'hardware', NULL, 'cpu', '#64748b', 3),
  ('Access/Login', 'access-login', NULL, 'lock', '#ef4444', 4),
  ('Email & Calendar', 'email-calendar', NULL, 'mail', '#f59e0b', 5),
  ('Performance', 'performance', NULL, 'gauge', '#10b981', 6),
  ('ACS', 'acs', NULL, 'door', '#0284c7', 7);

-- Sub-categories under Network Troubleshooting
INSERT INTO pb_categories (name, slug, parent_id, icon, color, sort_order)
SELECT c.name, c.slug, p.id, c.icon, c.color, c.sort_order
FROM (VALUES
  ('Wi-Fi', 'wi-fi', 'wifi', '#0ea5e9', 1),
  ('Internet Down', 'internet-down', 'globe', '#dc2626', 2),
  ('Slow Connection', 'slow-connection', 'gauge', '#f59e0b', 3),
  ('VPN', 'vpn', 'shield', '#8b5cf6', 4),
  ('DNS', 'dns', 'server', '#6366f1', 5),
  ('Packet Loss', 'packet-loss', 'activity', '#ef4444', 6)
) AS c(name, slug, icon, color, sort_order)
JOIN pb_categories p ON p.slug = 'network-troubleshooting'
ON CONFLICT DO NOTHING;

-- Sub-categories under App Troubleshooting
INSERT INTO pb_categories (name, slug, parent_id, icon, color, sort_order)
SELECT c.name, c.slug, p.id, c.icon, c.color, c.sort_order
FROM (VALUES
  ('Microsoft Teams', 'ms-teams', 'video', '#6264a7', 1),
  ('Softphone-Dialer', 'softphone-dialer', 'phone', '#0f9d58', 2),
  ('CRM', 'crm', 'database', '#f59e0b', 3),
  ('Browser', 'browser', 'globe', '#3b82f6', 4),
  ('VDI-Citrix', 'vdi-citrix', 'monitor', '#16a34a', 5)
) AS c(name, slug, icon, color, sort_order)
JOIN pb_categories p ON p.slug = 'app-troubleshooting'
ON CONFLICT DO NOTHING;

-- Sub-categories under Hardware
INSERT INTO pb_categories (name, slug, parent_id, icon, color, sort_order)
SELECT c.name, c.slug, p.id, c.icon, c.color, c.sort_order
FROM (VALUES
  ('Headset', 'headset', 'headphones', '#a855f7', 1),
  ('PC', 'pc', 'desktop', '#6b7280', 2),
  ('Monitor', 'monitor', 'display', '#0891b2', 3),
  ('Peripherals', 'peripherals', 'keyboard', '#64748b', 4)
) AS c(name, slug, icon, color, sort_order)
JOIN pb_categories p ON p.slug = 'hardware'
ON CONFLICT DO NOTHING;

-- Sub-categories under Access/Login
INSERT INTO pb_categories (name, slug, parent_id, icon, color, sort_order)
SELECT c.name, c.slug, p.id, c.icon, c.color, c.sort_order
FROM (VALUES
  ('Password-Lock', 'password-lock', 'key', '#ef4444', 1),
  ('MFA', 'mfa', 'shield-check', '#f59e0b', 2),
  ('Permissions', 'permissions', 'user-cog', '#8b5cf6', 3)
) AS c(name, slug, icon, color, sort_order)
JOIN pb_categories p ON p.slug = 'access-login'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Default tags
-- ============================================================================
INSERT INTO pb_tags (name, color, sort_order) VALUES
  ('network', '#0ea5e9', 1),
  ('vpn', '#8b5cf6', 2),
  ('teams', '#6264a7', 3),
  ('softphone', '#0f9d58', 4),
  ('hardware', '#64748b', 5),
  ('access', '#ef4444', 6),
  ('email', '#f59e0b', 7),
  ('outage', '#dc2626', 8),
  ('escalation', '#b91c1c', 9),
  ('recurring', '#d97706', 10)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- RPC: Search scenarios with filters
-- Facet counts computed dynamically from pb_criteria_fields
-- ============================================================================
CREATE OR REPLACE FUNCTION search_scenarios(
  p_query TEXT DEFAULT NULL,
  p_account_ids UUID[] DEFAULT NULL,
  p_account_match TEXT DEFAULT 'any', -- any | all | only
  p_category_ids UUID[] DEFAULT NULL,
  p_issue_type_ids UUID[] DEFAULT NULL,
  p_severity_ids UUID[] DEFAULT NULL,
  p_impact_scope_ids UUID[] DEFAULT NULL,
  p_custom_filters JSONB DEFAULT '{}'::jsonb,
  p_sort TEXT DEFAULT 'relevance',
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  summary TEXT,
  status TEXT,
  is_global BOOLEAN,
  account_id UUID,
  category_id UUID,
  issue_type_id UUID,
  severity_id UUID,
  impact_scope_id UUID,
  occurrence_count INT,
  last_occurred_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  rank REAL,
  total_count BIGINT
) AS $$
DECLARE
  v_tsquery tsquery;
  v_base UUID[];
BEGIN
  -- Build tsquery with synonym expansion
  IF p_query IS NOT NULL AND length(trim(p_query)) > 0 THEN
    v_tsquery := websearch_to_tsquery('english', p_query);
  ELSE
    v_tsquery := NULL;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      s.id,
      s.title,
      s.slug,
      s.summary,
      s.status,
      s.is_global,
      s.account_id,
      s.category_id,
      s.issue_type_id,
      s.severity_id,
      s.impact_scope_id,
      s.occurrence_count,
      s.last_occurred_at,
      s.updated_at,
      CASE
        WHEN v_tsquery IS NOT NULL THEN ts_rank(s.search_vector, v_tsquery)
        ELSE 0
      END AS rank
    FROM pb_scenarios s
    WHERE s.deleted_at IS NULL
      AND s.status = 'published'

      -- Text search: full-text OR trigram typo tolerance.
      -- word_similarity() compares the query against the best-matching word
      -- extent, so "intrenet" still matches "Internet Down ..." even when the
      -- whole-title similarity is diluted by extra words.
      -- Ticket IDs are searched too, so "TKT-9001" finds the scenario.
      AND (
        v_tsquery IS NULL
        OR s.search_vector @@ v_tsquery
        OR word_similarity(p_query, s.title) > 0.3
        OR word_similarity(p_query, coalesce(s.summary, '')) > 0.3
        OR EXISTS (
          SELECT 1 FROM pb_sample_tickets st
          WHERE st.scenario_id = s.id
            AND (st.ticket_id ILIKE '%' || p_query || '%'
                 OR similarity(st.ticket_id, p_query) > 0.3)
        )
      )

      -- Account filter with match mode.
      -- A scenario "matches" a selected account when its account_id is that
      -- account, or when the scenario is global (global applies everywhere).
      AND (
        p_account_ids IS NULL
        OR cardinality(p_account_ids) = 0
        OR (
          CASE p_account_match
            WHEN 'all' THEN (
              -- Common to ALL selected accounts
              (SELECT COUNT(DISTINCT m) FROM (
                SELECT unnest(p_account_ids) AS m
                UNION ALL
                SELECT s.account_id WHERE s.is_global AND s.account_id IS NOT NULL
              ) AS matched(m)
              WHERE m = ANY(p_account_ids)) = cardinality(p_account_ids)
            )
            WHEN 'only' THEN (
              -- Unique to exactly one selected account
              (SELECT COUNT(DISTINCT m) FROM (
                SELECT unnest(p_account_ids) AS m
                UNION ALL
                SELECT s.account_id WHERE s.is_global AND s.account_id IS NOT NULL
              ) AS matched(m)
              WHERE m = ANY(p_account_ids)) = 1
            )
            ELSE (
              -- Any selected account
              s.account_id = ANY(p_account_ids)
              OR s.is_global = TRUE
            )
          END
        )
      )

      -- Category filter
      AND (p_category_ids IS NULL OR cardinality(p_category_ids) = 0 OR s.category_id IN (SELECT unnest(p_category_ids)))

      -- Issue type filter
      AND (p_issue_type_ids IS NULL OR cardinality(p_issue_type_ids) = 0 OR s.issue_type_id IN (SELECT unnest(p_issue_type_ids)))

      -- Severity filter
      AND (p_severity_ids IS NULL OR cardinality(p_severity_ids) = 0 OR s.severity_id IN (SELECT unnest(p_severity_ids)))

      -- Impact scope filter
      AND (p_impact_scope_ids IS NULL OR cardinality(p_impact_scope_ids) = 0 OR s.impact_scope_id IN (SELECT unnest(p_impact_scope_ids)))

      -- Custom criteria filters (EAV).
      -- Shape: {"<field_id>": ["<option_id>", ...]}. A bare scalar is also
      -- accepted and treated as a single-element list.
      --
      -- Semantics: within one field the values are OR-ed (match any);
      -- across different fields they are AND-ed (must satisfy all).
      AND (
        p_custom_filters IS NULL
        OR p_custom_filters = '{}'::jsonb
        OR NOT EXISTS (
          -- One subquery per field: fails if this field has no matching value
          -- jsonb_each yields columns (key, value) -- alias them explicitly.
          SELECT 1
          FROM jsonb_each(p_custom_filters) AS f(key, value)
          WHERE NOT EXISTS (
            SELECT 1
            FROM pb_scenario_criteria_values v
            WHERE v.scenario_id = s.id
              AND v.field_id = f.key::uuid
              AND (
                v.option_id::text IN (
                  SELECT jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(f.value) = 'array'
                         THEN f.value
                         ELSE jsonb_build_array(f.value) END
                  )
                )
                OR v.value_text IN (
                  SELECT jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(f.value) = 'array'
                         THEN f.value
                         ELSE jsonb_build_array(f.value) END
                  )
                )
              )
          )
        )
      )
  )
  SELECT
    f.id, f.title, f.slug, f.summary, f.status, f.is_global,
    f.account_id, f.category_id, f.issue_type_id, f.severity_id,
    f.impact_scope_id, f.occurrence_count, f.last_occurred_at,
    f.updated_at, f.rank,
    (SELECT COUNT(*) FROM filtered) AS total_count
  FROM filtered f
  -- Each ORDER BY key is a CASE that yields NULL for non-applicable sorts;
  -- NULLS LAST keeps them below the active sort key.
  ORDER BY
    CASE WHEN p_sort = 'frequency' THEN f.occurrence_count END DESC NULLS LAST,
    CASE WHEN p_sort = 'newest'    THEN f.updated_at       END DESC NULLS LAST,
    CASE WHEN p_sort = 'oldest'    THEN f.updated_at       END ASC  NULLS LAST,
    CASE WHEN p_sort = 'title'     THEN f.title            END ASC  NULLS LAST,
    CASE WHEN p_sort <> 'title' AND p_sort <> 'oldest' AND p_sort <> 'newest' AND p_sort <> 'frequency'
         THEN f.rank END DESC NULLS LAST,
    f.occurrence_count DESC,
    f.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- RPC: Get facet counts for all active criteria fields
-- ============================================================================
CREATE OR REPLACE FUNCTION get_facet_counts(
  p_account_ids UUID[] DEFAULT NULL,
  p_category_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  field_id UUID,
  field_key TEXT,
  field_label TEXT,
  option_id UUID,
  option_label TEXT,
  option_color TEXT,
  count BIGINT
) AS $$
DECLARE
  -- Reserved for future per-call scoping
  v_unused UUID;
BEGIN
  RETURN QUERY
  -- System criteria: accounts
  SELECT
    cf.id, cf.key, cf.label,
    a.id, a.name, a.accent_color,
    COUNT(s.id)
  FROM pb_criteria_fields cf
  JOIN pb_accounts a ON a.id IS NOT NULL
  LEFT JOIN pb_scenarios s ON s.account_id = a.id AND s.deleted_at IS NULL AND s.status = 'published'
  WHERE cf.key = 'account' AND cf.is_active = TRUE AND cf.show_as_facet = TRUE
  GROUP BY cf.id, cf.key, cf.label, a.id, a.name, a.accent_color
  UNION ALL
  -- System criteria: category
  SELECT
    cf.id, cf.key, cf.label,
    c.id, c.name, c.color,
    COUNT(s.id)
  FROM pb_criteria_fields cf
  CROSS JOIN pb_categories c
  LEFT JOIN pb_scenarios s ON s.category_id = c.id AND s.deleted_at IS NULL AND s.status = 'published'
  WHERE cf.key = 'category' AND cf.is_active = TRUE AND cf.show_as_facet = TRUE
  GROUP BY cf.id, cf.key, cf.label, c.id, c.name, c.color
  UNION ALL
  -- System criteria: issue_type, severity, impact_scope, platform, site, work_setup, frequency
  SELECT
    cf.id, cf.key, cf.label,
    o.id, o.label, o.color,
    COUNT(s.id)
  FROM pb_criteria_fields cf
  JOIN pb_criteria_options o ON o.field_id = cf.id
  LEFT JOIN pb_scenarios s ON (
      CASE cf.key
        WHEN 'issue_type' THEN s.issue_type_id = o.id
        WHEN 'severity' THEN s.severity_id = o.id
        WHEN 'impact_scope' THEN s.impact_scope_id = o.id
        ELSE FALSE
      END
    ) AND s.deleted_at IS NULL AND s.status = 'published'
  WHERE cf.key IN ('issue_type','severity','impact_scope')
    AND cf.is_active = TRUE AND cf.show_as_facet = TRUE
  GROUP BY cf.id, cf.key, cf.label, o.id, o.label, o.color
  UNION ALL
  -- Custom criteria (EAV)
  SELECT
    cf.id, cf.key, cf.label,
    o.id, o.label, o.color,
    COUNT(v.scenario_id)
  FROM pb_criteria_fields cf
  JOIN pb_criteria_options o ON o.field_id = cf.id
  LEFT JOIN pb_scenario_criteria_values v ON v.field_id = cf.id AND v.option_id = o.id
  LEFT JOIN pb_scenarios s ON s.id = v.scenario_id AND s.deleted_at IS NULL AND s.status = 'published'
  WHERE cf.key NOT IN ('account','category','issue_type','severity','impact_scope')
    AND cf.is_active = TRUE AND cf.show_as_facet = TRUE
  GROUP BY cf.id, cf.key, cf.label, o.id, o.label, o.color;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- RPC: Coverage matrix (any two dimensions)
--
-- Both axes are resolved from a single dimension lookup so that the same
-- helper can label system fields (account, category, issue_type, severity,
-- impact_scope) and custom EAV fields (any other criteria field key).
-- ============================================================================
CREATE OR REPLACE FUNCTION get_coverage_matrix(
  p_row_field TEXT,
  p_col_field TEXT,
  p_account_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  row_key TEXT,
  row_label TEXT,
  row_color TEXT,
  col_key TEXT,
  col_label TEXT,
  col_color TEXT,
  count BIGINT
) AS $$
DECLARE
  v_row_sql TEXT;
  v_col_sql TEXT;
  v_row_join TEXT;
  v_col_join TEXT;
BEGIN
  -- For system fields, the value lives on pb_scenarios directly.
  -- For custom fields, the value lives in the EAV table.
  v_row_sql := CASE p_row_field
    WHEN 'account'      THEN 's.account_id'
    WHEN 'category'     THEN 's.category_id'
    WHEN 'issue_type'   THEN 's.issue_type_id'
    WHEN 'severity'     THEN 's.severity_id'
    WHEN 'impact_scope' THEN 's.impact_scope_id'
    ELSE NULL
  END;

  v_col_sql := CASE p_col_field
    WHEN 'account'      THEN 's.account_id'
    WHEN 'category'     THEN 's.category_id'
    WHEN 'issue_type'   THEN 's.issue_type_id'
    WHEN 'severity'     THEN 's.severity_id'
    WHEN 'impact_scope' THEN 's.impact_scope_id'
    ELSE NULL
  END;

  -- A custom axis needs a join to the EAV table filtered to that field.
  v_row_join := CASE WHEN v_row_sql IS NULL THEN
    'LEFT JOIN pb_scenario_criteria_values v ON v.scenario_id = s.id AND v.field_id = (SELECT id FROM pb_criteria_fields WHERE key = ' || quote_literal(p_row_field) || ')'
  ELSE '' END;

  v_col_join := CASE WHEN v_col_sql IS NULL THEN
    'LEFT JOIN pb_scenario_criteria_values w ON w.scenario_id = s.id AND w.field_id = (SELECT id FROM pb_criteria_fields WHERE key = ' || quote_literal(p_col_field) || ')'
  ELSE '' END;

  RETURN QUERY EXECUTE format($q$
    WITH dim AS (
      -- Accounts
      SELECT id AS opt_id, name AS opt_label, accent_color AS opt_color, 'account' AS opt_kind FROM pb_accounts
      UNION ALL
      -- Categories
      SELECT id, name, color, 'category' FROM pb_categories WHERE is_active
      UNION ALL
      -- Criteria options (covers issue_type, severity, impact_scope and custom fields)
      SELECT o.id, o.label, o.color, cf.key
      FROM pb_criteria_options o
      JOIN pb_criteria_fields cf ON cf.id = o.field_id
      WHERE cf.is_active
    ),
    base AS (
      SELECT
        s.id,
        %s AS row_key,
        %s AS col_key
      FROM pb_scenarios s
      %s
      %s
      WHERE s.deleted_at IS NULL
        AND s.status = 'published'
        AND ($3 IS NULL OR cardinality($3) = 0
             OR s.account_id = ANY($3) OR s.is_global)
    )
    SELECT
      b.row_key::text,
      COALESCE(rd.opt_label, b.row_key::text),
      rd.opt_color,
      b.col_key::text,
      COALESCE(cd.opt_label, b.col_key::text),
      cd.opt_color,
      COUNT(*)::BIGINT
    FROM base b
    LEFT JOIN dim rd ON rd.opt_id = b.row_key
    LEFT JOIN dim cd ON cd.opt_id = b.col_key
    GROUP BY b.row_key, rd.opt_label, rd.opt_color, b.col_key, cd.opt_label, cd.opt_color
  $q$,
    COALESCE(v_row_sql, 'v.option_id'),
    COALESCE(v_col_sql, 'w.option_id'),
    v_row_join,
    v_col_join
  )
  USING p_account_ids, p_account_ids, p_account_ids;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- RPC: Get published scenarios for an account, grouped by criteria
-- Supports the compiled Account Playbook views
-- ============================================================================
CREATE OR REPLACE FUNCTION get_account_playbook(
  p_account_id UUID,
  p_view TEXT DEFAULT 'all' -- frequent | anticipated | by_category | all | critical
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  summary TEXT,
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
    AND (s.is_global = TRUE OR s.account_id = p_account_id)
    AND (
      p_view = 'all'
      OR (p_view = 'frequent' AND it.value = 'frequent')
      OR (p_view = 'anticipated' AND it.value = 'anticipated')
      OR (p_view = 'critical' AND sv.value IN ('high','critical'))
    )
  ORDER BY s.is_pinned DESC, s.occurrence_count DESC, s.updated_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- RPC: Get scenarios for a category across accounts (Category Playbook view)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_category_playbook(
  p_category_id UUID,
  p_account_ids UUID[] DEFAULT NULL,
  p_account_match TEXT DEFAULT 'any',
  p_include_subcategories BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  summary TEXT,
  account_id UUID,
  account_name TEXT,
  account_code TEXT,
  account_color TEXT,
  is_global BOOLEAN,
  issue_type_id UUID,
  issue_type_label TEXT,
  severity_id UUID,
  severity_label TEXT,
  occurrence_count INT,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_cat_ids UUID[];
BEGIN
  -- Collect category and all descendants
  IF p_include_subcategories THEN
    WITH RECURSIVE cat_tree AS (
      SELECT c.id AS cat_id FROM pb_categories c WHERE c.id = p_category_id
      UNION ALL
      SELECT c.id FROM pb_categories c
      JOIN cat_tree ct ON c.parent_id = ct.cat_id
    )
    SELECT array_agg(cat_id) INTO v_cat_ids FROM cat_tree;
  ELSE
    v_cat_ids := ARRAY[p_category_id];
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.title, s.slug, s.summary,
    s.account_id, a.name, a.code, a.accent_color,
    s.is_global,
    s.issue_type_id, it.label,
    s.severity_id, sv.label,
    s.occurrence_count, s.updated_at
  FROM pb_scenarios s
  LEFT JOIN pb_accounts a ON a.id = s.account_id
  LEFT JOIN pb_criteria_options it ON it.id = s.issue_type_id
  LEFT JOIN pb_criteria_options sv ON sv.id = s.severity_id
  WHERE s.deleted_at IS NULL
    AND s.status = 'published'
    AND s.category_id IN (SELECT unnest(v_cat_ids))
    AND (
      p_account_ids IS NULL
      OR cardinality(p_account_ids) = 0
      OR (
        CASE p_account_match
          WHEN 'all' THEN (
            (SELECT COUNT(DISTINCT m) FROM (
              SELECT unnest(p_account_ids) AS m
              UNION ALL SELECT s.account_id WHERE s.is_global AND s.account_id IS NOT NULL
            ) AS matched(m) WHERE m = ANY(p_account_ids)) = cardinality(p_account_ids)
          )
          WHEN 'only' THEN (
            (SELECT COUNT(DISTINCT m) FROM (
              SELECT unnest(p_account_ids) AS m
              UNION ALL SELECT s.account_id WHERE s.is_global AND s.account_id IS NOT NULL
            ) AS matched(m) WHERE m = ANY(p_account_ids)) = 1
          )
          ELSE s.account_id = ANY(p_account_ids) OR s.is_global = TRUE
        END
      )
    )
  ORDER BY s.occurrence_count DESC, s.updated_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- RPC: Bulk update scenario criteria
-- ============================================================================
CREATE OR REPLACE FUNCTION bulk_update_scenario_criteria(
  p_scenario_ids UUID[],
  p_updates JSONB
)
RETURNS INTEGER AS $$
DECLARE
  v_count INT := 0;
  v_key TEXT;
  v_val JSONB;
BEGIN
  -- SECURITY DEFINER: guard inside the function
  IF NOT (has_permission('edit_any_scenario') OR is_super_admin()) THEN
    RAISE EXCEPTION 'You do not have permission to bulk edit scenarios'
      USING ERRCODE = '42501';
  END IF;
  -- Handle system criteria updates
  IF p_updates ? 'category_id' THEN
    UPDATE pb_scenarios SET category_id = (p_updates->>'category_id')::uuid
    WHERE id IN (SELECT unnest(p_scenario_ids)) AND deleted_at IS NULL;
  END IF;

  IF p_updates ? 'issue_type_id' THEN
    UPDATE pb_scenarios SET issue_type_id = (p_updates->>'issue_type_id')::uuid
    WHERE id IN (SELECT unnest(p_scenario_ids)) AND deleted_at IS NULL;
  END IF;

  IF p_updates ? 'severity_id' THEN
    UPDATE pb_scenarios SET severity_id = (p_updates->>'severity_id')::uuid
    WHERE id IN (SELECT unnest(p_scenario_ids)) AND deleted_at IS NULL;
  END IF;

  IF p_updates ? 'impact_scope_id' THEN
    UPDATE pb_scenarios SET impact_scope_id = (p_updates->>'impact_scope_id')::uuid
    WHERE id IN (SELECT unnest(p_scenario_ids)) AND deleted_at IS NULL;
  END IF;

  -- Handle account add/remove
  IF p_updates ? 'add_account_id' THEN
    INSERT INTO pb_scenario_accounts (scenario_id, account_id)
    SELECT s.id, (p_updates->>'add_account_id')::uuid
    FROM pb_scenarios s
    WHERE s.id IN (SELECT unnest(p_scenario_ids)) AND s.deleted_at IS NULL
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  IF p_updates ? 'remove_account_id' THEN
    DELETE FROM pb_scenario_accounts
    WHERE scenario_id IN (SELECT unnest(p_scenario_ids))
      AND account_id = (p_updates->>'remove_account_id')::uuid;
  END IF;

  -- Handle custom criteria updates: {"custom": {"field_id": ["option_id"]}}
  IF p_updates ? 'custom' THEN
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(p_updates->'custom') LOOP
      -- Delete existing values for this field
      DELETE FROM pb_scenario_criteria_values
      WHERE scenario_id IN (SELECT unnest(p_scenario_ids))
        AND field_id = v_key::uuid;

      -- Insert new values
      INSERT INTO pb_scenario_criteria_values (scenario_id, field_id, option_id)
      SELECT s.id, v_key::uuid, (opt::text)::uuid
        FROM pb_scenarios s
        CROSS JOIN jsonb_array_elements_text(v_val) AS opt
        WHERE s.id IN (SELECT unnest(p_scenario_ids)) AND s.deleted_at IS NULL
        ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Handle tags
  IF p_updates ? 'add_tags' THEN
    UPDATE pb_scenarios
    SET tags = array(select distinct unnest(tags || (p_updates->'add_tags')::text[]))
    WHERE id IN (SELECT unnest(p_scenario_ids)) AND deleted_at IS NULL;
  END IF;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RPC: Impact preview for config changes
-- Returns usage counts before destructive config operations
-- ============================================================================
CREATE OR REPLACE FUNCTION get_config_impact(
  p_config_type TEXT,
  p_config_id UUID
)
RETURNS TABLE (
  label TEXT,
  scenario_count BIGINT,
  account_count BIGINT
) AS $$
BEGIN
  IF p_config_type = 'category' THEN
    RETURN QUERY
    WITH RECURSIVE cat_tree AS (
      SELECT id FROM pb_categories WHERE id = p_config_id
      UNION ALL
      SELECT c.id FROM pb_categories c JOIN cat_tree ct ON c.parent_id = ct.id
    )
    SELECT
      (SELECT name FROM pb_categories WHERE id = p_config_id),
      COUNT(s.id),
      COUNT(DISTINCT s.account_id)
    FROM pb_scenarios s
    WHERE s.category_id IN (SELECT id FROM cat_tree) AND s.deleted_at IS NULL;
  ELSIF p_config_type = 'criteria_option' THEN
    RETURN QUERY
    SELECT
      (SELECT label FROM pb_criteria_options WHERE id = p_config_id),
      COUNT(s.id),
      COUNT(DISTINCT s.account_id)
    FROM pb_scenarios s
    JOIN pb_criteria_options o ON o.id = p_config_id
    WHERE s.deleted_at IS NULL AND (
      s.issue_type_id = o.id OR s.severity_id = o.id OR s.impact_scope_id = o.id
    );
  ELSIF p_config_type = 'account' THEN
    RETURN QUERY
    SELECT
      (SELECT name FROM pb_accounts WHERE id = p_config_id),
      COUNT(s.id),
      COUNT(DISTINCT s.account_id)
    FROM pb_scenarios s
    WHERE s.account_id = p_config_id AND s.deleted_at IS NULL;
  ELSE
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- RPC: Merge accounts
-- ============================================================================
CREATE OR REPLACE FUNCTION merge_accounts(
  p_source_account_id UUID,
  p_target_account_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_moved INT := 0;
  v_scenarios INT := 0;
BEGIN
  -- SECURITY DEFINER: guard inside the function
  IF NOT (has_permission('manage_accounts') OR is_super_admin()) THEN
    RAISE EXCEPTION 'You do not have permission to merge accounts'
      USING ERRCODE = '42501';
  END IF;

  IF p_source_account_id = p_target_account_id THEN
    RAISE EXCEPTION 'Cannot merge an account into itself' USING ERRCODE = '22023';
  END IF;
  -- Move scenarios
  UPDATE pb_scenarios SET account_id = p_target_account_id
  WHERE account_id = p_source_account_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_scenarios = ROW_COUNT;

  -- Move account links
  UPDATE pb_scenario_accounts SET account_id = p_target_account_id
  WHERE account_id = p_source_account_id;

  -- Move playbooks
  UPDATE pb_playbooks SET account_id = p_target_account_id
  WHERE account_id = p_source_account_id;

  -- Move user account access
  INSERT INTO pb_user_accounts (user_id, account_id)
  SELECT user_id, p_target_account_id FROM pb_user_accounts
  WHERE account_id = p_source_account_id
  ON CONFLICT DO NOTHING;

  -- Move templates
  UPDATE pb_templates SET account_id = p_target_account_id
  WHERE account_id = p_source_account_id;

  -- Archive the source account
  UPDATE pb_accounts SET status = 'Archived'
  WHERE id = p_source_account_id;

  RETURN format('Merged account %s into %s. %s scenarios moved, %s account links updated.',
    p_source_account_id, p_target_account_id, v_scenarios, v_moved);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RPC: Merge categories (preserves scenario links)
-- ============================================================================
CREATE OR REPLACE FUNCTION merge_categories(
  p_source_id UUID,
  p_target_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_scenarios INT := 0;
  v_children INT := 0;
BEGIN
  -- SECURITY DEFINER: guard inside the function
  IF NOT (has_permission('manage_criteria') OR is_super_admin()) THEN
    RAISE EXCEPTION 'You do not have permission to merge categories'
      USING ERRCODE = '42501';
  END IF;

  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Cannot merge a category into itself' USING ERRCODE = '22023';
  END IF;
  -- Move scenarios
  UPDATE pb_scenarios SET category_id = p_target_id
  WHERE category_id = p_source_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_scenarios = ROW_COUNT;

  -- Move child categories
  UPDATE pb_categories SET parent_id = p_target_id
  WHERE parent_id = p_source_id;
  GET DIAGNOSTICS v_children = ROW_COUNT;

  -- Update playbooks
  UPDATE pb_playbooks SET category_id = p_target_id
  WHERE category_id = p_source_id;

  -- Deactivate the source category
  UPDATE pb_categories SET is_active = FALSE
  WHERE id = p_source_id;

  RETURN format('Merged category %s into %s. %s scenarios and %s child categories moved.',
    p_source_id, p_target_id, v_scenarios, v_children);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RPC: Export configuration as JSON
-- ============================================================================
CREATE OR REPLACE FUNCTION export_config()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := jsonb_build_object(
    'version', '1.0',
    'exported_at', now(),
    'criteria_fields', (SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]'::jsonb) FROM pb_criteria_fields f),
    'criteria_options', (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb) FROM pb_criteria_options o),
    'categories', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM pb_categories c),
    'section_definitions', (SELECT COALESCE(jsonb_agg(to_jsonb(sd)), '[]'::jsonb) FROM pb_section_definitions sd),
    'templates', (SELECT COALESCE(jsonb_agg(to_jsonb(tp)), '[]'::jsonb) FROM pb_templates tp),
    'node_types', (SELECT COALESCE(jsonb_agg(to_jsonb(nt)), '[]'::jsonb) FROM pb_node_types nt),
    'outcomes', (SELECT COALESCE(jsonb_agg(to_jsonb(oc)), '[]'::jsonb) FROM pb_outcomes oc),
    'settings', (SELECT COALESCE(jsonb_agg(to_jsonb(st)), '[]'::jsonb) FROM pb_settings st),
    'synonyms', (SELECT COALESCE(jsonb_agg(to_jsonb(sy)), '[]'::jsonb) FROM pb_synonyms sy),
    'tags', (SELECT COALESCE(jsonb_agg(to_jsonb(tg)), '[]'::jsonb) FROM pb_tags tg)
  );
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- RPC: Get criteria field definitions for the editor and facets
-- ============================================================================
CREATE OR REPLACE FUNCTION get_criteria_definitions(p_applies_to TEXT DEFAULT 'scenarios')
RETURNS TABLE (
  id UUID,
  key TEXT,
  label TEXT,
  description TEXT,
  type TEXT,
  scope TEXT,
  applies_to TEXT,
  is_required BOOLEAN,
  required_condition JSONB,
  show_as_facet BOOLEAN,
  show_on_card BOOLEAN,
  default_value JSONB,
  sort_order INT,
  is_system BOOLEAN,
  is_active BOOLEAN
) AS $$
  SELECT
    cf.id, cf.key, cf.label, cf.description, cf.type, cf.scope, cf.applies_to,
    cf.is_required, cf.required_condition, cf.show_as_facet, cf.show_on_card,
    cf.default_value, cf.sort_order, cf.is_system, cf.is_active
  FROM pb_criteria_fields cf
  WHERE cf.is_active = TRUE
    AND (cf.applies_to = p_applies_to OR cf.applies_to = 'both')
  ORDER BY cf.sort_order, cf.label;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- RPC: Get criteria options for a field
-- ============================================================================
CREATE OR REPLACE FUNCTION get_criteria_options(p_field_id UUID)
RETURNS TABLE (
  id UUID,
  label TEXT,
  value TEXT,
  parent_id UUID,
  color TEXT,
  sort_order INT,
  is_active BOOLEAN
) AS $$
  SELECT o.id, o.label, o.value, o.parent_id, o.color, o.sort_order, o.is_active
  FROM pb_criteria_options o
  WHERE o.field_id = p_field_id
  ORDER BY o.sort_order, o.label;
$$ LANGUAGE sql STABLE SECURITY DEFINER;