\pset border 2
\echo '=== Counts ==='
SELECT
  (SELECT count(*) FROM pb_accounts)             AS accounts,
  (SELECT count(*) FROM pb_categories)           AS categories,
  (SELECT count(*) FROM pb_criteria_fields)      AS criteria_fields,
  (SELECT count(*) FROM pb_criteria_options)     AS criteria_options,
  (SELECT count(*) FROM pb_scenarios)            AS scenarios,
  (SELECT count(*) FROM pb_scenarios WHERE status='published') AS published,
  (SELECT count(*) FROM pb_scenarios WHERE is_global)          AS global_scen,
  (SELECT count(*) FROM pb_scenarios WHERE account_id IS NULL) AS no_account,
  (SELECT count(*) FROM pb_flowcharts)           AS flowcharts,
  (SELECT count(*) FROM pb_sample_tickets)       AS tickets,
  (SELECT count(*) FROM pb_templates)            AS templates,
  (SELECT count(*) FROM pb_playbooks)            AS playbooks,
  (SELECT count(*) FROM pb_playbooks WHERE type='curated') AS curated,
  (SELECT count(*) FROM pb_playbooks WHERE type='smart')   AS smart,
  (SELECT count(*) FROM pb_playbook_items)       AS playbook_items,
  (SELECT count(*) FROM pb_scenario_accounts)    AS account_links,
  (SELECT count(*) FROM pb_scenario_criteria_values) AS custom_values,
  (SELECT count(*) FROM pb_related_scenarios)    AS related,
  (SELECT count(*) FROM pb_user_profiles)        AS users,
  (SELECT count(*) FROM pb_user_roles)           AS user_roles;

\echo ''
\echo '=== Scenario spread by account ==='
SELECT a.code,
       count(*) FILTER (WHERE s.account_id = a.id)  AS primary,
       count(*) FILTER (WHERE sa.account_id = a.id) AS linked,
       count(*) FILTER (WHERE s.is_global)          AS globals
FROM pb_accounts a
LEFT JOIN pb_scenarios s ON true
LEFT JOIN pb_scenario_accounts sa ON sa.scenario_id = s.id AND sa.account_id = a.id
GROUP BY a.code ORDER BY a.code;

\echo ''
\echo '=== Issue type / severity / impact coverage ==='
SELECT it.value AS issue_type, count(*)
FROM pb_scenarios s JOIN pb_criteria_options it ON it.id = s.issue_type_id
GROUP BY it.value ORDER BY it.value;

SELECT sv.value AS severity, count(*)
FROM pb_scenarios s JOIN pb_criteria_options sv ON sv.id = s.severity_id
GROUP BY sv.value ORDER BY sv.value;

SELECT isc.value AS impact_scope, count(*)
FROM pb_scenarios s JOIN pb_criteria_options isc ON isc.id = s.impact_scope_id
GROUP BY isc.value ORDER BY isc.value;

\echo ''
\echo '=== Occurrence counts (derived from tickets) ==='
SELECT s.slug, s.occurrence_count, s.last_occurred_at,
       (SELECT count(*) FROM pb_sample_tickets t WHERE t.scenario_id = s.id) AS tickets
FROM pb_scenarios s
WHERE s.occurrence_count > 0
ORDER BY s.occurrence_count DESC LIMIT 8;

\echo ''
\echo '=== Custom criteria values (EAV) ==='
SELECT f.key, o.value, count(*)
FROM pb_scenario_criteria_values v
JOIN pb_criteria_fields f ON f.id = v.field_id
JOIN pb_criteria_options o ON o.id = v.option_id
GROUP BY f.key, o.value ORDER BY f.key, o.value;

\echo ''
\echo '=== Smart playbooks ==='
SELECT title, smart_filter FROM pb_playbooks WHERE type='smart';

\echo ''
\echo '=== Coverage matrix (category x account) ==='
SELECT * FROM get_coverage_matrix('category','account') ORDER BY row_label, col_label LIMIT 30;

\echo ''
\echo '=== Search: typo tolerance ==='
SELECT title, round(rank::numeric,4) AS rank FROM search_scenarios('intrenet down') LIMIT 5;

\echo ''
\echo '=== Search: account match modes ==='
WITH sel AS (SELECT array_agg(id) AS ids FROM pb_accounts WHERE code IN ('NWL','HLC'))
SELECT
  (SELECT count(*) FROM search_scenarios(NULL, sel.ids, 'any')) AS any_nwl_hlc,
  (SELECT count(*) FROM search_scenarios(NULL, sel.ids, 'all')) AS all_nwl_hlc,
  (SELECT count(*) FROM search_scenarios(NULL, sel.ids, 'only')) AS only_one
FROM sel;

\echo ''
\echo '=== Facet counts ==='
SELECT * FROM get_facet_counts(NULL) LIMIT 20;
