EXPLAIN (ANALYZE, BUFFERS)
SELECT st.scenario_id, max(pb_fuzzy_term_similarity('widfi', st.token))
FROM pb_scenario_tokens st
WHERE st.token % 'widfi'
GROUP BY st.scenario_id;
