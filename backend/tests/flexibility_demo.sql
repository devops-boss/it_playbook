-- ============================================================================
-- BOS Playbook - Flexibility demonstration
--
-- The specification says that nothing about the configuration is hard coded:
-- every list, every label, every rule is data. This file proves it against a
-- live database, by changing the configuration and watching the application
-- follow with no code change, no migration and no redeploy.
--
-- It runs inside a transaction that is rolled back at the end, so the
-- demonstration leaves the database exactly as it found it and can be run
-- against a live instance.
--
--   docker exec -i bos-db psql -U supabase_admin -d postgres \
--     -f backend/tests/flexibility_demo.sql
--
-- What it shows:
--
--   1. A new custom criterion appears in the definitions, in the search
--      facets and in the search itself - with no code change.
--   2. Renaming an option keeps its id and its content, so saved filters
--      and links keep working.
--   3. Deactivating an option keeps the content that used it and stops
--      offering it.
--   4. A new category appears in the tree and in the coverage matrix.
--   5. Making a criterion required changes what may be published, and
--      making it optional again changes it back.
--   6. A conditional requirement ("required only when ...") is honoured.
--   7. The configuration export contains everything, including what this
--      demonstration added.
--   8. Every configuration change is written to the audit log.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

\echo ''
\echo '################################################################'
\echo '#  BOS Playbook - the configuration is data, not code           #'
\echo '################################################################'

-- ---------------------------------------------------------------------------
-- 0. The starting point
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 0. The starting point ----------------------------------------'
SELECT
  (SELECT count(*) FROM pb_criteria_fields)                          AS criteria_fields,
  (SELECT count(*) FROM pb_criteria_options)                         AS criteria_options,
  (SELECT count(*) FROM pb_categories)                               AS categories,
  (SELECT count(*) FROM pb_scenarios WHERE deleted_at IS NULL)       AS scenarios;

-- ---------------------------------------------------------------------------
-- 1. A new criterion, and everything that follows from it
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 1. A new criterion -------------------------------------------'
\echo '-- 1a. The administrator adds a field. This is the only change.'

INSERT INTO pb_criteria_fields
  (key, label, description, type, scope, applies_to, is_required,
   show_as_facet, show_on_card, sort_order, is_system, is_active)
VALUES
  ('demo_window', 'Maintenance Window', 'When the change may be made',
   'single-select', 'global', 'both', FALSE, TRUE, TRUE, 900, FALSE, TRUE);

INSERT INTO pb_criteria_options (field_id, label, value, color, sort_order)
SELECT cf.id, o.label, o.value, o.color, o.sort_order
FROM pb_criteria_fields cf
CROSS JOIN (VALUES
  ('Business hours', 'business-hours', '#2563eb', 1),
  ('Out of hours',   'out-of-hours',   '#7c3aed', 2),
  ('Emergency only', 'emergency-only', '#dc2626', 3)
) AS o(label, value, color, sort_order)
WHERE cf.key = 'demo_window';

\echo '-- 1b. It is now a field like any other: the editor lists it.'
SELECT key, label, type, is_required, show_as_facet, show_on_card, sort_order
FROM get_criteria_definitions('scenarios')
WHERE key = 'demo_window';

\echo '-- 1c. It is a search facet, with live counts. No code was written.'
SELECT field_key, field_label, option_label, count
FROM get_facet_counts(NULL, NULL)
WHERE field_key = 'demo_window'
ORDER BY option_label;

\echo '-- 1d. A scenario is given values for it.'
INSERT INTO pb_scenario_criteria_values (scenario_id, field_id, option_id)
SELECT s.id, cf.id, o.id
FROM pb_scenarios s
CROSS JOIN pb_criteria_fields cf
CROSS JOIN pb_criteria_options o
WHERE cf.key = 'demo_window'
  AND o.value IN ('emergency-only', 'out-of-hours')
  AND s.status = 'published'
  AND s.title = (
    SELECT title FROM pb_scenarios
    WHERE status = 'published'
    ORDER BY occurrence_count DESC
    LIMIT 1
  );

\echo '-- 1e. And the search now finds it by that criterion alone.'
\echo '--     The filter is keyed by the field id, like every other facet.'
SELECT sc.title
FROM search_scenarios(
  p_custom_filters => jsonb_build_object(
    (SELECT id::text FROM pb_criteria_fields WHERE key = 'demo_window'),
    ARRAY[
      (SELECT o.id::text FROM pb_criteria_options o
       JOIN pb_criteria_fields cf ON cf.id = o.field_id
       WHERE cf.key = 'demo_window' AND o.value = 'emergency-only')
    ]::text[]
  )
) s
JOIN pb_scenarios sc ON sc.id = s.id;

-- ---------------------------------------------------------------------------
-- 2. Renaming an option keeps the id
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 2. Renaming an option ----------------------------------------'
\echo '-- The id and the value are the stable parts. A saved filter that says'
\echo '-- "this option" keeps working after the label changes.'

CREATE TEMP TABLE option_before AS
SELECT id, label, value FROM pb_criteria_options WHERE value = 'out-of-hours';

UPDATE pb_criteria_options
SET label = 'Outside working hours'
WHERE value = 'out-of-hours';

SELECT
  o.id = b.id            AS id_unchanged,
  o.value = b.value      AS value_unchanged,
  b.label               AS label_before,
  o.label               AS label_after
FROM pb_criteria_options o
JOIN option_before b ON b.id = o.id;

\echo '-- The content that used the option is still attached to it:'
SELECT sc.title, o.label AS option_now_reads_as
FROM pb_scenario_criteria_values v
JOIN pb_scenarios sc ON sc.id = v.scenario_id
JOIN pb_criteria_options o ON o.id = v.option_id
WHERE o.value = 'out-of-hours';

-- ---------------------------------------------------------------------------
-- 3. Deactivating an option
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 3. Deactivating an option ------------------------------------'
\echo '-- The content stays. The option is simply not offered any more.'

UPDATE pb_criteria_options SET is_active = FALSE WHERE value = 'out-of-hours';

SELECT
  (SELECT count(*) FROM pb_scenario_criteria_values v
   JOIN pb_criteria_options o ON o.id = v.option_id
   WHERE o.value = 'out-of-hours')                AS content_kept,
  (SELECT count(*) FROM pb_criteria_options o
   JOIN pb_criteria_fields cf ON cf.id = o.field_id
   WHERE cf.key = 'demo_window' AND o.is_active) AS options_still_offered;

-- ---------------------------------------------------------------------------
-- 4. A new category
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 4. A new category --------------------------------------------'
\echo '-- It appears in the tree straight away.'

INSERT INTO pb_categories (name, slug, icon, color, sort_order, is_active)
VALUES ('Demo Category', 'demo-category', 'flask', '#0ea5e9', 950, TRUE);

SELECT name, slug, icon, color, sort_order, is_active
FROM pb_categories WHERE slug = 'demo-category';

\echo '-- A scenario is written in that category and published.'
INSERT INTO pb_scenarios
  (title, slug, summary, status, is_global, account_id, category_id,
   issue_type_id, severity_id, impact_scope_id, quick_fix, created_at)
SELECT
  'Demo scenario', 'demo-scenario', 'A scenario written by the demonstration.',
  'draft', TRUE,
  (SELECT id FROM pb_accounts ORDER BY name LIMIT 1),
  (SELECT id FROM pb_categories WHERE slug = 'demo-category'),
  (SELECT o.id FROM pb_criteria_options o JOIN pb_criteria_fields f
     ON f.id = o.field_id WHERE f.key = 'issue_type' ORDER BY o.sort_order LIMIT 1),
  (SELECT o.id FROM pb_criteria_options o JOIN pb_criteria_fields f
     ON f.id = o.field_id WHERE f.key = 'severity' ORDER BY o.sort_order LIMIT 1),
  (SELECT o.id FROM pb_criteria_options o JOIN pb_criteria_fields f
     ON f.id = o.field_id WHERE f.key = 'impact_scope' ORDER BY o.sort_order LIMIT 1),
  'Restart the adapter.', now()
WHERE NOT EXISTS (SELECT 1 FROM pb_scenarios WHERE slug = 'demo-scenario');

\echo '-- The category now shows in the tree, with its scenario:'
UPDATE pb_scenarios SET status = 'published' WHERE slug = 'demo-scenario';

SELECT c.name AS category, sc.title AS scenario
FROM pb_categories c
LEFT JOIN pb_scenarios sc
  ON sc.category_id = c.id AND sc.status = 'published' AND sc.deleted_at IS NULL
WHERE c.slug = 'demo-category';

\echo '-- ... and the coverage matrix counts it, because it is published:'
SELECT row_label, col_label, count
FROM get_coverage_matrix('category', 'account', NULL)
WHERE row_label = 'Demo Category';

-- ---------------------------------------------------------------------------
-- 5. Making a criterion required changes what may be published
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 5. Required and optional -------------------------------------'
\echo '-- The demonstration scenario is given the new criterion, and the'
\echo '-- criterion is then made required. The value is taken away.'

INSERT INTO pb_scenario_criteria_values (scenario_id, field_id, option_id)
SELECT s.id, cf.id, o.id
FROM pb_scenarios s
CROSS JOIN pb_criteria_fields cf
CROSS JOIN pb_criteria_options o
WHERE s.slug = 'demo-scenario'
  AND cf.key = 'demo_window'
  AND o.value = 'business-hours';

UPDATE pb_criteria_fields SET is_required = TRUE WHERE key = 'demo_window';

UPDATE pb_scenarios SET status = 'draft' WHERE slug = 'demo-scenario';

DELETE FROM pb_scenario_criteria_values v
USING pb_scenarios s
WHERE v.scenario_id = s.id
  AND s.slug = 'demo-scenario'
  AND v.field_id = (SELECT id FROM pb_criteria_fields WHERE key = 'demo_window');

DO $$
BEGIN
  BEGIN
    UPDATE pb_scenarios SET status = 'published' WHERE slug = 'demo-scenario';
    RAISE EXCEPTION 'TEST FAILED: the publish was not blocked';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: publishing is blocked while the criterion is required (SQLSTATE %)', SQLSTATE;
  END;
END $$;

\echo '-- The criterion is made optional again, and the publish goes through.'
UPDATE pb_criteria_fields SET is_required = FALSE WHERE key = 'demo_window';

DO $$
BEGIN
  UPDATE pb_scenarios SET status = 'published' WHERE slug = 'demo-scenario';
  RAISE NOTICE 'PASS: publishing is allowed again once the criterion is optional';
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'TEST FAILED: the publish was still blocked: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 6. A conditional requirement
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 6. "Required only when ..." ----------------------------------'
\echo '-- The rule is a row of data: a condition on another field.'

UPDATE pb_criteria_fields
SET is_required = TRUE,
    required_condition = '{"if":[{"field_key":"category","value":"demo-category"}]}'
WHERE key = 'demo_window';

DO $$
BEGIN
  BEGIN
    UPDATE pb_scenarios SET status = 'draft' WHERE slug = 'demo-scenario';
    UPDATE pb_scenarios SET status = 'published' WHERE slug = 'demo-scenario';
    RAISE EXCEPTION 'TEST FAILED: the condition should have made the criterion required';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: the condition is met, so the criterion is required and the publish is blocked';
  END;
END $$;

\echo '-- Move the scenario out of the category the condition names, and the'
\echo '-- criterion is not required any more.'
UPDATE pb_scenarios
SET category_id = (SELECT id FROM pb_categories WHERE slug <> 'demo-category'
                    ORDER BY sort_order LIMIT 1)
WHERE slug = 'demo-scenario';

DO $$
BEGIN
  UPDATE pb_scenarios SET status = 'draft' WHERE slug = 'demo-scenario';
  UPDATE pb_scenarios SET status = 'published' WHERE slug = 'demo-scenario';
  RAISE NOTICE 'PASS: the condition is not met, so the criterion is not required and the publish goes through';
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'TEST FAILED: the publish was blocked: %', SQLERRM;
END $$;

UPDATE pb_criteria_fields
SET is_required = FALSE, required_condition = NULL
WHERE key = 'demo_window';

-- ---------------------------------------------------------------------------
-- 7. The configuration export
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 7. The configuration export -----------------------------------'
\echo '-- It is generated from the tables, so it contains what was added.'

SELECT
  (export_config() -> 'criteria_fields') @> '[{"key":"demo_window"}]'::jsonb
    AS export_has_new_field,
  (export_config() -> 'categories') @> '[{"slug":"demo-category"}]'::jsonb
    AS export_has_new_category,
  jsonb_array_length(export_config() -> 'criteria_fields') AS fields_in_export,
  jsonb_array_length(export_config() -> 'categories')     AS categories_in_export;

-- ---------------------------------------------------------------------------
-- 8. The audit log
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 8. The audit log ---------------------------------------------'
\echo '-- Every configuration change above was written down. Only the rows'
\echo '-- written by this transaction are shown, so the seed is not counted.'

SELECT entity_type, action, count(*) AS changes
FROM pb_audit_log
WHERE xmin = txid_current()
GROUP BY entity_type, action
ORDER BY entity_type, action;

ROLLBACK;

\echo ''
\echo '################################################################'
\echo '#  The demonstration is finished. The changes were rolled back, #'
\echo '#  so the database is exactly as it was.                        #'
\echo '################################################################'
