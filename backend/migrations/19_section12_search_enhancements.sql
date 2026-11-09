-- ============================================================================
-- Section 12: Search & Filter Enhancements
-- Big Outsource IT Operations Playbook
-- ============================================================================

-- Drop existing search_scenarios function with its specific argument signature
DROP FUNCTION IF EXISTS search_scenarios(TEXT, UUID[], TEXT, UUID[], UUID[], UUID[], UUID[], JSONB, TEXT, INT, INT);

-- Recreate search_scenarios with support for:
-- 1. Full HESK ticket tracking ID and numeric ticket matching (e.g. 'BOS-49281' and '49281')
-- 2. Account name and code matching
-- 3. Category name matching
-- 4. Quick Fix and Sample Tickets included in output columns
-- 5. Sub-second ranking with ticket match boost
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
  quick_fix TEXT,
  sample_ticket_ids TEXT[],
  occurrence_count INT,
  last_occurred_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  rank REAL,
  total_count BIGINT
) AS $$
DECLARE
  v_tsquery      tsquery;
  v_tsquery_text TEXT;
  v_terms        TEXT[] := ARRAY[]::TEXT[];
  v_fuzzy_terms  TEXT[] := ARRAY[]::TEXT[];
  v_term         TEXT;
  v_group        TEXT;
  v_has_query    BOOLEAN;
  v_trusted      BOOLEAN;
  v_allowed_accounts UUID[];
BEGIN
  v_has_query := p_query IS NOT NULL AND btrim(p_query) <> '';

  -- Account access resolution
  v_trusted := pb_trusted_context() OR is_super_admin();

  IF v_trusted THEN
    v_allowed_accounts := ARRAY[]::UUID[];
  ELSE
    v_allowed_accounts := ARRAY(
      SELECT a.id FROM pb_accounts a WHERE has_account_access(a.id)
    );
  END IF;

  -- Build full-text query with synonyms
  IF v_has_query THEN
    v_terms := regexp_split_to_array(btrim(p_query), '\s+');
    v_tsquery_text := '';

    FOREACH v_term IN ARRAY v_terms LOOP
      IF v_term = '' THEN
        CONTINUE;
      END IF;

      SELECT coalesce(string_agg(g, ' | ' ORDER BY g), '')
      INTO v_group
      FROM (
        SELECT websearch_to_tsquery('english', alt)::text AS g
        FROM (
          SELECT v_term AS alt
          UNION ALL
          SELECT unnest(sy.alternatives)
          FROM pb_synonyms sy
          WHERE lower(sy.term) = lower(v_term)
        ) alts
        WHERE websearch_to_tsquery('english', alt)::text <> ''
      ) groups;

      IF v_group <> '' THEN
        IF v_tsquery_text <> '' THEN
          v_tsquery_text := v_tsquery_text || ' & ';
        END IF;
        v_tsquery_text := v_tsquery_text || '(' || v_group || ')';
      END IF;
    END LOOP;

    IF v_tsquery_text <> '' THEN
      v_tsquery := v_tsquery_text::tsquery;
    ELSE
      v_tsquery := NULL;
    END IF;

    -- Normalize terms for typo matching
    v_fuzzy_terms := ARRAY(
      SELECT DISTINCT lower(regexp_replace(regexp_replace(t, '[-_]', '', 'g'), '[^a-z0-9]+', '', 'g'))
      FROM unnest(v_terms) t
      WHERE length(regexp_replace(regexp_replace(t, '[-_]', '', 'g'), '[^a-z0-9]+', '', 'g')) >= 3
        AND (
          length(regexp_replace(regexp_replace(t, '[-_]', '', 'g'), '[^a-z0-9]+', '', 'g')) > 3
          OR to_tsvector('english', t) <> ''
        )
        AND t !~ '^[A-Za-z]{2,5}[-_]?[0-9]{3,}$'
    );
  END IF;

  RETURN QUERY
  WITH
  -- 1. Trigram fuzzy candidate search
  fuzzy AS MATERIALIZED (
    SELECT
      st.scenario_id,
      t.term,
      max(pb_fuzzy_term_similarity(t.term, st.token)) AS best_sim,
      max(CASE WHEN st.in_title
               THEN pb_fuzzy_term_similarity(t.term, st.token)
               ELSE 0.0::real END) AS title_sim
    FROM unnest(v_fuzzy_terms) AS t(term)
    JOIN pb_scenario_tokens st ON st.token % t.term
    GROUP BY st.scenario_id, t.term
  ),
  fuzzy_ok AS MATERIALIZED (
    SELECT
      f.scenario_id,
      sum(f.best_sim)::real  AS score,
      sum(f.title_sim)::real AS title_score
    FROM fuzzy f
    GROUP BY f.scenario_id
    HAVING count(*) FILTER (WHERE f.best_sim >= 0.30) = cardinality(v_fuzzy_terms)
       AND (
         cardinality(v_fuzzy_terms) = 1
         OR count(*) FILTER (WHERE f.best_sim >= 0.50) >= 1
       )
  ),
  -- 2. Candidates collection
  candidates AS MATERIALIZED (
    -- Path A: Full-text search on search_vector
    SELECT s.id
    FROM pb_scenarios s
    WHERE v_has_query
      AND s.deleted_at IS NULL
      AND s.status = 'published'
      AND v_tsquery IS NOT NULL
      AND s.search_vector @@ v_tsquery

    UNION

    -- Path B: Trigram typo tolerance
    SELECT fk.scenario_id
    FROM fuzzy_ok fk

    UNION

    -- Path C: Sample tickets (HESK tracking ID e.g. 'BOS-49281' or numeric '49281')
    SELECT tk.scenario_id
    FROM pb_sample_tickets tk
    WHERE v_has_query
      AND EXISTS (
        SELECT 1
        FROM unnest(v_terms) AS t(term)
        WHERE (
          -- Exact or substring match on ticket_id
          tk.ticket_id ILIKE '%' || t.term || '%'
          -- Numeric-only match: e.g. term '49281' matches 'BOS-49281'
          OR (t.term ~ '^[0-9]{3,}$' AND regexp_replace(tk.ticket_id, '[^0-9]', '', 'g') = t.term)
          -- Stripped punctuation match
          OR regexp_replace(lower(tk.ticket_id), '[-_]', '', 'g') = regexp_replace(lower(t.term), '[-_]', '', 'g')
          OR similarity(tk.ticket_id, t.term) > 0.45
        )
      )

    UNION

    -- Path D: Account Name or Code match
    SELECT s.id
    FROM pb_scenarios s
    JOIN pb_accounts a ON a.id = s.account_id
    WHERE v_has_query
      AND s.deleted_at IS NULL
      AND s.status = 'published'
      AND EXISTS (
        SELECT 1
        FROM unnest(v_terms) AS t(term)
        WHERE a.name ILIKE '%' || t.term || '%'
           OR a.code ILIKE '%' || t.term || '%'
      )

    UNION

    -- Path E: Category Name match
    SELECT s.id
    FROM pb_scenarios s
    JOIN pb_categories c ON c.id = s.category_id
    WHERE v_has_query
      AND s.deleted_at IS NULL
      AND s.status = 'published'
      AND EXISTS (
        SELECT 1
        FROM unnest(v_terms) AS t(term)
        WHERE c.name ILIKE '%' || t.term || '%'
      )
  ),
  -- 3. Filter candidate scenarios
  filtered AS (
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
      s.quick_fix,
      ARRAY(
        SELECT tk.ticket_id
        FROM pb_sample_tickets tk
        WHERE tk.scenario_id = s.id
        ORDER BY tk.created_at DESC
        LIMIT 5
      ) AS sample_ticket_ids,
      s.occurrence_count,
      s.last_occurred_at,
      s.updated_at,
      -- Ranking score
      (
        CASE
          WHEN v_tsquery IS NOT NULL AND s.search_vector @@ v_tsquery
            THEN ts_rank(s.search_vector, v_tsquery)
          ELSE 0.0::real
        END
        + coalesce(fok.score, 0.0::real) * 0.4
        + coalesce(fok.title_score, 0.0::real) * 0.8
        + CASE
            -- Major boost if a ticket matches
            WHEN EXISTS (
              SELECT 1 FROM pb_sample_tickets tk2
              WHERE tk2.scenario_id = s.id
                AND EXISTS (
                  SELECT 1 FROM unnest(v_terms) AS t(term)
                  WHERE tk2.ticket_id ILIKE '%' || t.term || '%'
                     OR (t.term ~ '^[0-9]{3,}$' AND regexp_replace(tk2.ticket_id, '[^0-9]', '', 'g') = t.term)
                )
            ) THEN 8.0::real
            ELSE 0.0::real
          END
        + CASE
            WHEN v_has_query AND s.title ILIKE '%' || p_query || '%' THEN 5.0::real
            ELSE 0.0::real
          END
      )::real AS rank
    FROM pb_scenarios s
    LEFT JOIN fuzzy_ok fok ON fok.scenario_id = s.id
    WHERE s.deleted_at IS NULL
      AND s.status = 'published'
      AND (
        NOT v_has_query
        OR s.id IN (SELECT c.id FROM candidates c)
      )
      -- Account permissions
      AND (
        v_trusted
        OR s.is_global
        OR (s.account_id IS NOT NULL AND s.account_id = ANY(v_allowed_accounts))
        OR EXISTS (
          SELECT 1 FROM pb_scenario_accounts sa
          WHERE sa.scenario_id = s.id AND sa.account_id = ANY(v_allowed_accounts)
        )
      )
      -- User-supplied Account filter
      AND (
        p_account_ids IS NULL
        OR (
          p_account_match = 'any' AND (
            s.is_global
            OR s.account_id = ANY(p_account_ids)
            OR EXISTS (
              SELECT 1 FROM pb_scenario_accounts sa
              WHERE sa.scenario_id = s.id AND sa.account_id = ANY(p_account_ids)
            )
          )
        )
        OR (
          p_account_match = 'only' AND (
            s.account_id = ANY(p_account_ids)
            OR EXISTS (
              SELECT 1 FROM pb_scenario_accounts sa
              WHERE sa.scenario_id = s.id AND sa.account_id = ANY(p_account_ids)
            )
          )
        )
      )
      -- Category filter
      AND (p_category_ids IS NULL OR s.category_id = ANY(p_category_ids))
      -- System Criteria filters
      AND (p_issue_type_ids IS NULL OR s.issue_type_id = ANY(p_issue_type_ids))
      AND (p_severity_ids IS NULL OR s.severity_id = ANY(p_severity_ids))
      AND (p_impact_scope_ids IS NULL OR s.impact_scope_id = ANY(p_impact_scope_ids))
      -- Custom EAV criteria filters
      AND (
        p_custom_filters IS NULL
        OR p_custom_filters = '{}'::jsonb
        OR (
          SELECT bool_and(
            EXISTS (
              SELECT 1
              FROM pb_scenario_criteria_values scv
              WHERE scv.scenario_id = s.id
                AND scv.field_id = (filter.key)::uuid
                AND scv.option_id = ANY(
                  SELECT (jsonb_array_elements_text(filter.value))::uuid
                )
            )
          )
          FROM jsonb_each(p_custom_filters) AS filter
        )
      )
  )
  SELECT
    f.id,
    f.title,
    f.slug,
    f.summary,
    f.status,
    f.is_global,
    f.account_id,
    f.category_id,
    f.issue_type_id,
    f.severity_id,
    f.impact_scope_id,
    f.quick_fix,
    f.sample_ticket_ids,
    f.occurrence_count,
    f.last_occurred_at,
    f.updated_at,
    f.rank,
    count(*) OVER () AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN p_sort = 'relevance' THEN f.rank END DESC,
    CASE WHEN p_sort = 'frequency' THEN f.occurrence_count END DESC,
    CASE WHEN p_sort = 'newest' THEN f.updated_at END DESC,
    CASE WHEN p_sort = 'oldest' THEN f.updated_at END ASC,
    CASE WHEN p_sort = 'title' THEN f.title END ASC,
    f.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION search_scenarios(TEXT, UUID[], TEXT, UUID[], UUID[], UUID[], UUID[], JSONB, TEXT, INT, INT)
  TO authenticated, anon, service_role;
