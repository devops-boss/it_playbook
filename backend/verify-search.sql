\pset border 2
\echo '=== Typo tolerance ==='
SELECT title FROM search_scenarios('intrenet down') LIMIT 5;
SELECT title FROM search_scenarios('softphne registrtion') LIMIT 5;
SELECT title FROM search_scenarios('widfi droping') LIMIT 5;
SELECT title FROM search_scenarios('vpn conect') LIMIT 5;
SELECT title FROM search_scenarios('teams audoi') LIMIT 5;

\echo ''
\echo '=== Exact search still works ==='
SELECT title FROM search_scenarios('internet') LIMIT 5;

\echo ''
\echo '=== Every term must match: "vpn conect" must not return "connect" only ==='
SELECT title FROM search_scenarios('vpn conect') LIMIT 10;

\echo ''
\echo '=== A query with no match returns nothing ==='
SELECT count(*) AS printer_offline FROM search_scenarios('printer offline');

\echo ''
\echo '=== Sample ticket id ==='
SELECT title FROM search_scenarios('INC-48115') LIMIT 5;

\echo ''
\echo '=== Synonym expansion: "vpn" finds the remote access scenario ==='
SELECT title FROM search_scenarios('vpn') LIMIT 5;

\echo ''
\echo '=== Account match modes (NWL + HLC) ==='
WITH sel AS (SELECT array_agg(id) AS ids FROM pb_accounts WHERE code IN ('NWL','HLC'))
SELECT
  (SELECT count(*) FROM search_scenarios(NULL, sel.ids, 'any'))  AS any_nwl_hlc,
  (SELECT count(*) FROM search_scenarios(NULL, sel.ids, 'all'))  AS all_nwl_hlc,
  (SELECT count(*) FROM search_scenarios(NULL, sel.ids, 'only')) AS only_one
FROM sel;

\echo ''
\echo '--- Common to ALL (NWL + HLC): the 4 shared scenarios + 3 globals ---'
SELECT s.title, s.is_global
FROM search_scenarios(NULL, (SELECT array_agg(id) FROM pb_accounts WHERE code IN ('NWL','HLC')), 'all') r
JOIN pb_scenarios s ON s.id = r.id
ORDER BY s.is_global, s.title;

\echo ''
\echo '--- Unique to one of NWL/HLC ---'
SELECT s.title, a.code
FROM search_scenarios(NULL, (SELECT array_agg(id) FROM pb_accounts WHERE code IN ('NWL','HLC')), 'only') r
JOIN pb_scenarios s ON s.id = r.id
LEFT JOIN pb_accounts a ON a.id = s.account_id
ORDER BY a.code, s.title;

\echo ''
\echo '--- Any of NWL/HLC ---'
SELECT count(*) FROM search_scenarios(NULL, (SELECT array_agg(id) FROM pb_accounts WHERE code IN ('NWL','HLC')), 'any');

\echo ''
\echo '=== Token index ==='
SELECT count(*) AS token_rows, count(DISTINCT scenario_id) AS scenarios FROM pb_scenario_tokens;
SELECT count(*) AS title_flagged FROM pb_scenario_tokens WHERE in_title;

\echo ''
\echo '=== Ranking: the title hit comes first ==='
SELECT title, round(rank::numeric, 4) AS rank
FROM search_scenarios('widfi droping')
ORDER BY rank DESC;

\echo ''
\echo '=== Audit trail ==='
SELECT entity_type, action, count(*) FROM pb_audit_log GROUP BY 1,2 ORDER BY 1,2;
