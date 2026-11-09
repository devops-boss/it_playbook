-- ============================================================================
-- BOS Playbook - Where does the search time go?
--
-- The search function is a plpgsql function, so EXPLAIN cannot look inside
-- it. This script runs the same query as plain SQL, with the parameters
-- written out, so the planner can show where the time is spent.
-- ============================================================================
\pset border 2
\timing on

\echo '=== building a synthetic corpus ==='
INSERT INTO pb_scenarios (title, summary, status, is_global, account_id, category_id,
                           issue_type_id, severity_id, impact_scope_id,
                           quick_fix, symptoms, causes, workarounds, resolutions)
SELECT
  s.title || ' (site ' || g || ')', s.summary, 'published', s.is_global, s.account_id,
  s.category_id, s.issue_type_id, s.severity_id, s.impact_scope_id,
  s.quick_fix, s.symptoms, s.causes, s.workarounds, s.resolutions
FROM pb_scenarios s
CROSS JOIN generate_series(1, 200) g
WHERE s.title NOT LIKE '%(site %)';

\echo '=== corpus size ==='
SELECT (SELECT count(*) FROM pb_scenarios) AS scenarios,
       (SELECT count(*) FROM pb_scenario_tokens) AS tokens;

\echo ''
\echo '=== VARIANT A: the tsquery match and the fuzzy match in one OR ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
WITH
fuzzy AS MATERIALIZED (
  SELECT st.scenario_id, 'internet'::text AS term,
         max(pb_fuzzy_term_similarity('internet'::text, st.token)) AS best_sim,
         max(CASE WHEN st.in_title THEN pb_fuzzy_term_similarity('internet'::text, st.token)
                  ELSE 0.0::real END) AS title_sim
  FROM unnest(ARRAY['internet']::text[]) AS t(term)
  JOIN pb_scenario_tokens st ON st.token % t.term
  GROUP BY st.scenario_id, t.term
),
fuzzy_ok AS MATERIALIZED (
  SELECT f.scenario_id, sum(f.best_sim)::real AS score, sum(f.title_sim)::real AS title_score
  FROM fuzzy f GROUP BY f.scenario_id
  HAVING count(*) FILTER (WHERE f.best_sim >= 0.30) = 1
),
filtered AS (
  SELECT s.id, s.title, s.occurrence_count, s.updated_at,
         (CASE WHEN s.search_vector @@ websearch_to_tsquery('english','internet')
               THEN ts_rank(s.search_vector, websearch_to_tsquery('english','internet')) ELSE 0 END
          + CASE WHEN fk.scenario_id IS NOT NULL THEN 0.5*fk.score + 0.25*fk.title_score ELSE 0 END)::real AS rank
  FROM pb_scenarios s
  LEFT JOIN fuzzy_ok fk ON fk.scenario_id = s.id
  WHERE s.deleted_at IS NULL AND s.status='published'
    AND (s.search_vector @@ websearch_to_tsquery('english','internet') OR fk.scenario_id IS NOT NULL)
)
SELECT f.id, f.title, f.rank, (SELECT COUNT(*) FROM filtered) AS total_count
FROM filtered f ORDER BY f.rank DESC NULLS LAST LIMIT 25;

\echo ''
\echo '=== VARIANT B: the candidates are worked out first, then joined ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
WITH
fuzzy AS MATERIALIZED (
  SELECT st.scenario_id, 'internet'::text AS term,
         max(pb_fuzzy_term_similarity('internet'::text, st.token)) AS best_sim,
         max(CASE WHEN st.in_title THEN pb_fuzzy_term_similarity('internet'::text, st.token)
                  ELSE 0.0::real END) AS title_sim
  FROM unnest(ARRAY['internet']::text[]) AS t(term)
  JOIN pb_scenario_tokens st ON st.token % t.term
  GROUP BY st.scenario_id, t.term
),
fuzzy_ok AS MATERIALIZED (
  SELECT f.scenario_id, sum(f.best_sim)::real AS score, sum(f.title_sim)::real AS title_score
  FROM fuzzy f GROUP BY f.scenario_id
  HAVING count(*) FILTER (WHERE f.best_sim >= 0.30) = 1
),
candidates AS MATERIALIZED (
  SELECT s.id FROM pb_scenarios s
  WHERE s.deleted_at IS NULL AND s.status='published'
    AND s.search_vector @@ websearch_to_tsquery('english','internet')
  UNION
  SELECT fk.scenario_id FROM fuzzy_ok fk
),
filtered AS (
  SELECT s.id, s.title, s.occurrence_count, s.updated_at,
         (CASE WHEN s.search_vector @@ websearch_to_tsquery('english','internet')
               THEN ts_rank(s.search_vector, websearch_to_tsquery('english','internet')) ELSE 0 END
          + CASE WHEN fk.scenario_id IS NOT NULL THEN 0.5*fk.score + 0.25*fk.title_score ELSE 0 END)::real AS rank
  FROM candidates c
  JOIN pb_scenarios s ON s.id = c.id
  LEFT JOIN fuzzy_ok fk ON fk.scenario_id = s.id
  WHERE s.deleted_at IS NULL AND s.status='published'
)
SELECT f.id, f.title, f.rank, (SELECT COUNT(*) FROM filtered) AS total_count
FROM filtered f ORDER BY f.rank DESC NULLS LAST LIMIT 25;

\echo ''
\echo '=== removing the synthetic corpus ==='
DELETE FROM pb_scenarios WHERE title LIKE '%(site %)';
SELECT (SELECT count(*) FROM pb_scenarios) AS scenarios_left;
