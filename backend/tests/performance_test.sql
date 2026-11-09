-- ============================================================================
-- BOS Playbook - Search performance at scale
--
-- The specification asks for searches and filters to answer in under 300
-- milliseconds on the LAN. That target is meaningless without a corpus of
-- a realistic size, so this script builds one: it clones the seeded
-- scenarios into a few thousand synthetic ones, which fills the token
-- index, and then times the search paths.
--
-- The synthetic rows are removed again at the end, so the script can be
-- run against the seeded database without changing it.
--
--   psql -f backend/tests/performance_test.sql
-- ============================================================================
\pset border 2
\timing on

-- ---------------------------------------------------------------------------
-- How many copies of the corpus
-- ---------------------------------------------------------------------------
\set copies 200

\echo '=== building a synthetic corpus ==='

INSERT INTO pb_scenarios (title, summary, status, is_global, account_id, category_id,
                           issue_type_id, severity_id, impact_scope_id,
                           quick_fix, symptoms, causes, workarounds, resolutions)
SELECT
  s.title || ' (site ' || g || ')',
  s.summary,
  'published',
  s.is_global,
  s.account_id,
  s.category_id,
  s.issue_type_id,
  s.severity_id,
  s.impact_scope_id,
  s.quick_fix,
  s.symptoms,
  s.causes,
  s.workarounds,
  s.resolutions
FROM pb_scenarios s
CROSS JOIN generate_series(1, :copies) g
WHERE s.title NOT LIKE '%(site %';

\echo '=== corpus size ==='
SELECT (SELECT count(*) FROM pb_scenarios)                        AS scenarios,
       (SELECT count(*) FROM pb_scenario_tokens)                  AS tokens,
       (SELECT pg_size_pretty(pg_total_relation_size('pb_scenario_tokens'))) AS token_table;

-- ---------------------------------------------------------------------------
-- The timings
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== timing: exact search (full text path) ==='
\timing on
SELECT count(*) FROM search_scenarios('internet');
\timing off

\echo ''
\echo '=== timing: typo search (trigram path) ==='
\timing on
SELECT count(*) FROM search_scenarios('intrenet down');
\timing off

\echo ''
\echo '=== timing: two-word typo search ==='
\timing on
SELECT count(*) FROM search_scenarios('vpn conect');
\timing off

\echo ''
\echo '=== timing: search with a facet filter ==='
\timing on
SELECT count(*) FROM search_scenarios(
  'internet',
  p_category_ids => ARRAY[(SELECT id FROM pb_categories WHERE slug='internet-down')],
  p_severity_ids => ARRAY[(SELECT id FROM pb_criteria_options WHERE value='critical')]
);
\timing off

\echo ''
\echo '=== timing: browse with no query (the common case for a category page) ==='
\timing on
SELECT count(*) FROM search_scenarios(NULL);
\timing off

\echo ''
\echo '=== the plan the trigram path uses at this size ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT st.scenario_id, max(pb_fuzzy_term_similarity('widfi', st.token))
FROM pb_scenario_tokens st
WHERE st.token % 'widfi'
GROUP BY st.scenario_id;

-- ---------------------------------------------------------------------------
-- Clean up
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== removing the synthetic corpus ==='
DELETE FROM pb_scenarios WHERE title LIKE '%(site %)';

SELECT (SELECT count(*) FROM pb_scenarios)     AS scenarios_left,
       (SELECT count(*) FROM pb_scenario_tokens) AS tokens_left;
