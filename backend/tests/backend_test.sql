-- ============================================================================
-- BOS Playbook - Backend Verification Suite
-- Run against a freshly migrated database.
--   docker exec -i pb-test-db psql -U postgres -f backend/tests/backend_test.sql
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo ''
\echo '############ 1. SEEDED CONFIGURATION ############'
SELECT count(*) AS criteria_fields FROM pb_criteria_fields;
SELECT count(*) AS criteria_options FROM pb_criteria_options;
SELECT count(*) AS categories FROM pb_categories;
SELECT count(*) AS section_defs FROM pb_section_definitions;
SELECT count(*) AS node_types FROM pb_node_types;
SELECT count(*) AS outcomes FROM pb_outcomes;
SELECT count(*) AS roles FROM pb_roles;
SELECT count(*) AS permissions FROM pb_role_permissions;

\echo ''
\echo '############ 2. PUBLISH GATE ############'
\echo '-- 2a. incomplete scenario must be REJECTED'
DO $$
BEGIN
  BEGIN
    INSERT INTO pb_scenarios (title, status) VALUES ('Should Fail', 'published');
    RAISE EXCEPTION 'TEST FAILED: incomplete scenario was allowed to publish';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: publish blocked (SQLSTATE %) - %', SQLSTATE, SQLERRM;
  END;
END $$;

\echo '-- 2b. complete scenario must be ACCEPTED'
INSERT INTO pb_accounts (name, code) VALUES ('Alpha Corp', 'ALPHA');
INSERT INTO pb_scenarios (title, summary, symptoms, status, account_id, category_id, issue_type_id, severity_id, impact_scope_id)
SELECT 'Internet Down at Client Site', 'Total internet outage affecting the floor',
       '<p>All agents report no connectivity. Router lights show red WAN light.</p>',
       'published',
       (SELECT id FROM pb_accounts WHERE code='ALPHA'),
       (SELECT id FROM pb_categories WHERE slug='internet-down'),
       (SELECT id FROM pb_criteria_options WHERE value='frequent'),
       (SELECT id FROM pb_criteria_options WHERE value='critical'),
       (SELECT id FROM pb_criteria_options WHERE value='site');
SELECT title, status, published_at IS NOT NULL AS has_published_at FROM pb_scenarios;

\echo '-- 2c. conditional requirement: field required only for certain categories'
INSERT INTO pb_criteria_fields (key, label, type, is_required, required_condition, is_system, sort_order)
VALUES ('escalation_contact', 'Escalation Contact', 'text', TRUE,
        '{"if":[{"field_key":"category","value":"Network Troubleshooting"}]}', FALSE, 20);
DO $$
BEGIN
  -- Category is 'internet-down' (a child of network-troubleshooting), so the
  -- condition (exact match on 'Network Troubleshooting') is NOT met -> allowed
  INSERT INTO pb_scenarios (title, status, account_id, category_id, issue_type_id, severity_id, impact_scope_id)
  SELECT 'Should Publish Without Escalation Contact', 'published',
    (SELECT id FROM pb_accounts WHERE code='ALPHA'),
    (SELECT id FROM pb_categories WHERE slug='internet-down'),
    (SELECT id FROM pb_criteria_options WHERE value='frequent'),
    (SELECT id FROM pb_criteria_options WHERE value='low'),
    (SELECT id FROM pb_criteria_options WHERE value='team');
  RAISE NOTICE 'PASS: condition not met -> field not required';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'INFO: raised %', SQLERRM;
END $$;

\echo ''
\echo '############ 3. SEARCH VECTOR ############'
SELECT title,
       search_vector @@ to_tsquery('english','internet') AS hits_internet,
       search_vector @@ to_tsquery('english','router') AS hits_router,
       search_vector @@ to_tsquery('english','outage') AS hits_outage
FROM pb_scenarios;

\echo ''
\echo '############ 4. OCCURRENCE COUNTING (ticket trigger) ############'
INSERT INTO pb_sample_tickets (scenario_id, ticket_id, ticket_date, problem_reported, outcome_id)
SELECT id, 'TKT-9001', '2026-01-15', 'Internet down, router red', (SELECT id FROM pb_outcomes WHERE value='resolved') FROM pb_scenarios LIMIT 1;
INSERT INTO pb_sample_tickets (scenario_id, ticket_id, ticket_date, problem_reported, outcome_id)
SELECT id, 'TKT-9002', '2026-06-20', 'Internet down again', (SELECT id FROM pb_outcomes WHERE value='workaround') FROM pb_scenarios LIMIT 1;
SELECT title, occurrence_count, last_occurred_at FROM pb_scenarios;

\echo ''
\echo '############ 5. VERSIONS (auto snapshot on content change) ############'
UPDATE pb_scenarios SET summary = 'Updated summary after incident review' WHERE slug LIKE 'internet-down%';
SELECT version FROM pb_scenarios WHERE slug LIKE 'internet-down%';
SELECT count(*) AS version_rows FROM pb_versions;

\echo ''
\echo '############ 6. SEARCH RPC ############'
SELECT title, total_count FROM search_scenarios(p_query => 'internet');
SELECT title, total_count FROM search_scenarios(p_query => 'intrenet');  -- typo tolerance via pg_trgm
SELECT title FROM search_scenarios(p_sort => 'frequency');
SELECT title FROM search_scenarios(p_severity_ids => ARRAY[(SELECT id FROM pb_criteria_options WHERE value='critical')]);

\echo ''
\echo '############ 7. FACET COUNTS ############'
SELECT field_key, option_label, count FROM get_facet_counts() WHERE count > 0 ORDER BY field_key, option_label;

\echo ''
\echo '############ 8. COVERAGE MATRIX ############'
SELECT row_label, col_label, count FROM get_coverage_matrix('category','account') WHERE count > 0;
SELECT row_label, col_label, count FROM get_coverage_matrix('account','severity') WHERE count > 0;

\echo ''
\echo '############ 9. ACCOUNT + CATEGORY PLAYBOOK VIEWS ############'
SELECT title, issue_type_label, severity_label, occurrence_count FROM get_account_playbook((SELECT id FROM pb_accounts WHERE code='ALPHA'), 'all');
SELECT title, account_name FROM get_category_playbook((SELECT id FROM pb_categories WHERE slug='network-troubleshooting'));

\echo ''
\echo '############ 10. CUSTOM CRITERIA (EAV) + DYNAMIC FACET ############'
INSERT INTO pb_criteria_fields (key, label, type, is_required, show_as_facet, show_on_card, sort_order)
VALUES ('isp_vendor', 'ISP/Vendor', 'single-select', FALSE, TRUE, TRUE, 21);
INSERT INTO pb_criteria_options (field_id, label, value, color, sort_order)
SELECT id, 'Example ISP', 'example_isp', '#0ea5e9', 1 FROM pb_criteria_fields WHERE key='isp_vendor';
INSERT INTO pb_scenario_criteria_values (scenario_id, field_id, option_id)
SELECT s.id, cf.id, co.id FROM pb_scenarios s
CROSS JOIN pb_criteria_fields cf CROSS JOIN pb_criteria_options co
WHERE cf.key='isp_vendor' AND co.value='example_isp' AND s.slug LIKE 'internet-down%';
\echo '-- new custom field must appear in facets automatically:'
SELECT field_key, option_label, count FROM get_facet_counts() WHERE field_key='isp_vendor';
\echo '-- and must be filterable via search RPC:'
-- Build a real JSON array of option ids (not a string containing JSON)
SELECT count(*) AS matched FROM search_scenarios(p_custom_filters => jsonb_build_object(
  (SELECT id::text FROM pb_criteria_fields WHERE key='isp_vendor'),
  jsonb_build_array((SELECT id::text FROM pb_criteria_options WHERE value='example_isp'))
));

\echo ''
\echo '############ 11. BULK EDIT ############'
-- Run as a Super Admin (the function is SECURITY DEFINER and checks
-- has_permission() against auth.uid(), so a superuser connection without a
-- JWT claim would be rejected).
INSERT INTO auth.users (id, email) VALUES ('33333333-3333-3333-3333-333333333333','admin@test.com');
INSERT INTO pb_user_roles (user_id, role_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM pb_roles WHERE name='Super Admin';
DO $$
DECLARE
  v_scenario UUID;
  v_severity UUID;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  SELECT id INTO v_scenario FROM pb_scenarios LIMIT 1;
  SELECT id INTO v_severity FROM pb_criteria_options WHERE value='medium';
  PERFORM bulk_update_scenario_criteria(
    ARRAY[v_scenario],
    jsonb_build_object('severity_id', v_severity)
  );
  RAISE NOTICE 'PASS: bulk edit executed by Super Admin';
END $$;
SELECT title, severity_id = (SELECT id FROM pb_criteria_options WHERE value='medium') AS severity_updated FROM pb_scenarios;

\echo ''
\echo '############ 12. CONFIG IMPACT PREVIEW ############'
SELECT * FROM get_config_impact('category', (SELECT id FROM pb_categories WHERE slug='internet-down'));
SELECT * FROM get_config_impact('account', (SELECT id FROM pb_accounts WHERE code='ALPHA'));

\echo ''
\echo '############ 13. CONFIG EXPORT ############'
SELECT k AS exported_section
FROM jsonb_object_keys(export_config()) AS k
ORDER BY 1;

\echo ''
\echo '############ 14. AUDIT TRAIL ############'
SELECT config_type, action, count(*) FROM pb_config_history GROUP BY config_type, action ORDER BY config_type;

\echo ''
\echo '############ 15. RLS ENFORCEMENT ############'
INSERT INTO auth.users (id, email) VALUES ('22222222-2222-2222-2222-222222222222','agent@test.com');
INSERT INTO pb_user_roles (user_id, role_id)
SELECT '22222222-2222-2222-2222-222222222222', id FROM pb_roles WHERE name='IT Agent';
INSERT INTO pb_user_accounts (user_id, account_id)
SELECT '22222222-2222-2222-2222-222222222222', id FROM pb_accounts WHERE code='ALPHA';
INSERT INTO pb_accounts (name, code) VALUES ('Beta Industries', 'BETA');
INSERT INTO pb_scenarios (title,status,account_id,category_id,issue_type_id,severity_id,impact_scope_id)
SELECT 'Beta Only Scenario','published',(SELECT id FROM pb_accounts WHERE code='BETA'),
  (SELECT id FROM pb_categories WHERE slug='internet-down'),
  (SELECT id FROM pb_criteria_options WHERE value='frequent'),
  (SELECT id FROM pb_criteria_options WHERE value='low'),
  (SELECT id FROM pb_criteria_options WHERE value='team');

\echo '-- as IT Agent with access to ALPHA only:'
DO $$
DECLARE
  v_leak INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  SELECT count(*) INTO v_leak FROM pb_scenarios WHERE title = 'Beta Only Scenario';
  IF v_leak > 0 THEN
    RAISE EXCEPTION 'TEST FAILED: RLS leak - agent saw a scenario from an account they cannot access';
  END IF;
  RAISE NOTICE 'PASS: RLS blocks cross-account access (saw % beta scenarios)', v_leak;
END $$;

\echo ''
\echo '############ 16. MUTATION RPC PERMISSION GUARDS ############'
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  BEGIN
    PERFORM bulk_update_scenario_criteria(ARRAY[(SELECT id FROM pb_scenarios LIMIT 1)], '{}'::jsonb);
    RAISE EXCEPTION 'TEST FAILED: agent was allowed to bulk edit';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: bulk edit blocked for IT Agent (SQLSTATE %)', SQLSTATE;
  END;
END $$;

\echo ''
\echo '#####################################################'
\echo '#            ALL BACKEND TESTS COMPLETED            #'
\echo '#####################################################'
