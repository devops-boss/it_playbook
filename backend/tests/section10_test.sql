-- ============================================================================
-- BOS Playbook - Section 10 Acceptance Test Suite
-- ============================================================================
-- Tests:
-- 1. Database trigger blocks publish if required criteria are missing (SQL error 23514)
-- 2. Database trigger blocks publish if Quick Fix is missing (SQL error 23514)
-- 3. Database trigger blocks publish if Resolution steps are missing (SQL error 23514)
-- 4. Publishing succeeds when all required items and criteria are present
-- 5. Standard templates (Internet Down, Teams Audio/Video, VPN, Login Failure) exist
-- 6. duplicate_scenario() clones a scenario into a draft
-- 7. archive_scenario() archives an active scenario
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_admin_id UUID;
  v_hc_id UUID;
  v_cat_internet UUID;
  v_sev_critical UUID;
  v_type_frequent UUID;
  v_impact_site UUID;

  v_scen_id UUID;
  v_clone_id UUID;
  v_archived BOOLEAN;
  v_template_count INT;
  v_blocked BOOLEAN;
BEGIN
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'RUNNING SECTION 10 TEST SUITE: SCENARIO EDITOR & PUBLISHING';
  RAISE NOTICE '------------------------------------------------------------';

  -- Resolve test references
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'paulreinier.vista@bigoutsource.com';
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM auth.users LIMIT 1;
  END IF;

  SELECT id INTO v_hc_id FROM pb_accounts WHERE code = 'HC';
  SELECT id INTO v_cat_internet FROM pb_categories WHERE slug = 'internet-down';

  SELECT co.id INTO v_sev_critical FROM pb_criteria_options co JOIN pb_criteria_fields cf ON co.field_id = cf.id WHERE cf.key = 'severity' AND co.label = 'Critical';
  SELECT co.id INTO v_type_frequent FROM pb_criteria_options co JOIN pb_criteria_fields cf ON co.field_id = cf.id WHERE cf.key = 'issue_type' AND co.label = 'Frequent/Known';
  SELECT co.id INTO v_impact_site FROM pb_criteria_options co JOIN pb_criteria_fields cf ON co.field_id = cf.id WHERE cf.key = 'impact_scope' AND co.label = 'Site';

  -- --------------------------------------------------------------------------
  -- Test 1: Publish blocked when required criteria missing
  -- --------------------------------------------------------------------------
  INSERT INTO pb_scenarios (
    title, slug, status, quick_fix, resolutions, created_by
  ) VALUES (
    'Test Incomplete Criteria', 'test-incomplete-criteria-' || substr(md5(random()::text), 1, 6),
    'draft', '<p>Some quick fix</p>', '[{"step": 1, "instruction": "Do fix"}]', v_admin_id
  ) RETURNING id INTO v_scen_id;

  v_blocked := FALSE;
  BEGIN
    UPDATE pb_scenarios SET status = 'published' WHERE id = v_scen_id;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_blocked := TRUE;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'CHECK 1 FAILED: Database allowed publish with missing required criteria!';
  END IF;
  RAISE NOTICE '✓ Check 1 Passed: Database trigger enforces required criteria and blocked publish.';

  -- --------------------------------------------------------------------------
  -- Test 2: Publish blocked when Quick Fix is missing
  -- --------------------------------------------------------------------------
  UPDATE pb_scenarios SET
    account_id = v_hc_id,
    category_id = v_cat_internet,
    issue_type_id = v_type_frequent,
    severity_id = v_sev_critical,
    impact_scope_id = v_impact_site,
    quick_fix = NULL
  WHERE id = v_scen_id;

  v_blocked := FALSE;
  BEGIN
    UPDATE pb_scenarios SET status = 'published' WHERE id = v_scen_id;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_blocked := TRUE;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'CHECK 2 FAILED: Database allowed publish with missing Quick Fix!';
  END IF;
  RAISE NOTICE '✓ Check 2 Passed: Database trigger blocked publish with missing Quick Fix.';

  -- --------------------------------------------------------------------------
  -- Test 3: Publish blocked when Resolutions are missing
  -- --------------------------------------------------------------------------
  UPDATE pb_scenarios SET
    quick_fix = '<p>Valid quick fix</p>',
    resolutions = '[]'
  WHERE id = v_scen_id;

  v_blocked := FALSE;
  BEGIN
    UPDATE pb_scenarios SET status = 'published' WHERE id = v_scen_id;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_blocked := TRUE;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'CHECK 3 FAILED: Database allowed publish with empty resolution steps!';
  END IF;
  RAISE NOTICE '✓ Check 3 Passed: Database trigger blocked publish with empty resolution steps.';

  -- --------------------------------------------------------------------------
  -- Test 4: Complete scenario publishes successfully
  -- --------------------------------------------------------------------------
  UPDATE pb_scenarios SET
    resolutions = '[{"step": 1, "instruction": "Reboot router", "command": "reboot"}]',
    status = 'published'
  WHERE id = v_scen_id;

  IF (SELECT status FROM pb_scenarios WHERE id = v_scen_id) <> 'published' THEN
    RAISE EXCEPTION 'CHECK 4 FAILED: Scenario failed to publish with complete data!';
  END IF;
  RAISE NOTICE '✓ Check 4 Passed: Scenario with complete criteria, quick fix, and resolutions published successfully.';

  -- --------------------------------------------------------------------------
  -- Test 5: Verify 4 standard templates exist
  -- --------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_template_count
  FROM pb_templates
  WHERE name IN ('Internet Down', 'Teams Audio/Video', 'VPN', 'Login Failure')
    AND is_active = TRUE;

  IF v_template_count <> 4 THEN
    RAISE EXCEPTION 'CHECK 5 FAILED: Expected 4 standard templates, found %', v_template_count;
  END IF;
  RAISE NOTICE '✓ Check 5 Passed: All 4 standard templates (Internet Down, Teams Audio/Video, VPN, Login Failure) exist and active.';

  -- --------------------------------------------------------------------------
  -- Test 6: duplicate_scenario() function
  -- --------------------------------------------------------------------------
  SELECT duplicate_scenario(v_scen_id) INTO v_clone_id;
  IF v_clone_id IS NULL THEN
    RAISE EXCEPTION 'CHECK 6 FAILED: duplicate_scenario returned null!';
  END IF;

  IF (SELECT status FROM pb_scenarios WHERE id = v_clone_id) <> 'draft' THEN
    RAISE EXCEPTION 'CHECK 6 FAILED: Cloned scenario must be in draft status!';
  END IF;
  RAISE NOTICE '✓ Check 6 Passed: duplicate_scenario() successfully cloned scenario into a draft.';

  -- --------------------------------------------------------------------------
  -- Test 7: archive_scenario() function
  -- --------------------------------------------------------------------------
  SELECT archive_scenario(v_scen_id) INTO v_archived;
  IF NOT v_archived OR (SELECT status FROM pb_scenarios WHERE id = v_scen_id) <> 'archived' THEN
    RAISE EXCEPTION 'CHECK 7 FAILED: archive_scenario failed to update status to archived!';
  END IF;
  RAISE NOTICE '✓ Check 7 Passed: archive_scenario() successfully marked scenario as archived.';

  -- Cleanup test scenarios
  DELETE FROM pb_scenarios WHERE id IN (v_scen_id, v_clone_id);

  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'ALL SECTION 10 ACCEPTANCE CHECKS PASSED SUCCESSFULLY!';
  RAISE NOTICE '------------------------------------------------------------';
END $$;

COMMIT;
