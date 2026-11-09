-- ============================================================================
-- Section 8 Acceptance Tests: Manage Screens & Operations
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

\echo '-------------------------------------------------------------'
\echo 'TEST 1: IT SUPPORT CAN ADD AND UPDATE AN ACCOUNT'
\echo '-------------------------------------------------------------'
DO $$
DECLARE
  v_support_id UUID;
  v_acct_id    UUID;
  v_audit_cnt  INT;
BEGIN
  SELECT id INTO v_support_id FROM pb_user_profiles WHERE role = 'IT Support' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_support_id::text, true);

  -- 1a. IT Support inserts a new account
  INSERT INTO pb_accounts (name, code, accent_color, description, status, ticket_url_template)
  VALUES ('Test Account QA', 'TAQA', '#288FC2', 'Test Account for QA', 'Active', 'https://tickets.example.com/{ID}')
  RETURNING id INTO v_acct_id;

  -- 1b. IT Support updates the account
  UPDATE pb_accounts 
  SET description = 'Updated description QA', accent_color = '#E07E3C'
  WHERE id = v_acct_id;

  RESET ROLE;

  SELECT count(*) INTO v_audit_cnt FROM pb_audit_log WHERE entity_id = v_acct_id;
  IF v_audit_cnt = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: No audit log generated for account operations!';
  END IF;

  -- Clean up test account
  DELETE FROM pb_accounts WHERE id = v_acct_id;
  RAISE NOTICE 'CHECK 1 PASSED: IT Support successfully added, updated, and audited an account.';
END $$;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'TEST 2: IT SUPPORT CAN ADD, RENAME, NEST, AND AUDIT CATEGORIES'
\echo '-------------------------------------------------------------'
DO $$
DECLARE
  v_support_id UUID;
  v_parent_id  UUID;
  v_child_id   UUID;
  v_audit_cnt  INT;
BEGIN
  SELECT id INTO v_support_id FROM pb_user_profiles WHERE role = 'IT Support' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_support_id::text, true);

  -- 2a. Insert parent category
  INSERT INTO pb_categories (name, slug, color, sort_order, is_active)
  VALUES ('Network QA', 'network-qa', '#233B74', 99, true)
  RETURNING id INTO v_parent_id;

  -- 2b. Insert child category nested under parent
  INSERT INTO pb_categories (name, slug, parent_id, color, sort_order, is_active)
  VALUES ('VPN Access QA', 'vpn-access-qa', v_parent_id, '#288FC2', 1, true)
  RETURNING id INTO v_child_id;

  -- 2c. Rename category while keeping stable ID
  UPDATE pb_categories
  SET name = 'VPN & Remote Access QA'
  WHERE id = v_child_id;

  RESET ROLE;

  SELECT count(*) INTO v_audit_cnt FROM pb_audit_log WHERE entity_id IN (v_parent_id, v_child_id);
  IF v_audit_cnt = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: No audit log generated for category operations!';
  END IF;

  -- Clean up test categories
  DELETE FROM pb_categories WHERE id = v_child_id;
  DELETE FROM pb_categories WHERE id = v_parent_id;
  RAISE NOTICE 'CHECK 2 PASSED: Category tree creation, nesting, renaming, and auditing verified.';
END $$;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'TEST 3: IT SUPPORT CAN MANAGE CLASSIFICATION OPTIONS (ISSUE TYPES)'
\echo '-------------------------------------------------------------'
DO $$
DECLARE
  v_support_id UUID;
  v_field_id   UUID;
  v_option_id  UUID;
  v_audit_cnt  INT;
BEGIN
  SELECT id INTO v_support_id FROM pb_user_profiles WHERE role = 'IT Support' LIMIT 1;
  SELECT id INTO v_field_id FROM pb_criteria_fields WHERE key = 'issue_type' LIMIT 1;

  IF v_field_id IS NULL THEN
    RAISE EXCEPTION 'Criteria field issue_type not found!';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_support_id::text, true);

  -- 3a. Add new option
  INSERT INTO pb_criteria_options (field_id, label, value, color, sort_order, is_active)
  VALUES (v_field_id, 'Hardware Failure QA', 'hardware-failure-qa', '#E07E3C', 99, true)
  RETURNING id INTO v_option_id;

  -- 3b. Deactivate option (inactive options stay on old records, hidden from new ones)
  UPDATE pb_criteria_options
  SET is_active = false
  WHERE id = v_option_id;

  RESET ROLE;

  SELECT count(*) INTO v_audit_cnt FROM pb_audit_log WHERE entity_id = v_option_id;
  IF v_audit_cnt = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: No audit log generated for criteria option!';
  END IF;

  -- Clean up test option
  DELETE FROM pb_criteria_options WHERE id = v_option_id;
  RAISE NOTICE 'CHECK 3 PASSED: Classification option addition, deactivation, and auditing verified.';
END $$;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'TEST 4: DELETING A CATEGORY USED BY SCENARIOS IS BLOCKED'
\echo '-------------------------------------------------------------'
DO $$
DECLARE
  v_cat_id     UUID;
  v_scen_id    UUID;
  v_acct_id    UUID;
  v_support_id UUID;
  v_blocked    BOOLEAN := false;
BEGIN
  SELECT id INTO v_support_id FROM pb_user_profiles WHERE role = 'IT Support' LIMIT 1;
  SELECT id INTO v_acct_id FROM pb_accounts LIMIT 1;

  -- Setup a test category with an attached scenario
  INSERT INTO pb_categories (name, slug, color, sort_order, is_active)
  VALUES ('Protected Category QA', 'protected-cat-qa', '#794183', 99, true)
  RETURNING id INTO v_cat_id;

  INSERT INTO pb_scenarios (title, slug, category_id, account_id, summary, status, created_by)
  VALUES ('Test Linked Scenario', 'test-linked-scenario', v_cat_id, v_acct_id, 'Prob', 'draft', v_support_id)
  RETURNING id INTO v_scen_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_support_id::text, true);

  -- Attempt to delete the category linked to scenario (MUST BE BLOCKED)
  BEGIN
    DELETE FROM pb_categories WHERE id = v_cat_id;
  EXCEPTION WHEN foreign_key_violation OR others THEN
    v_blocked := true;
  END;

  RESET ROLE;

  -- Clean up test scenario and category
  DELETE FROM pb_scenarios WHERE id = v_scen_id;
  DELETE FROM pb_categories WHERE id = v_cat_id;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'TEST FAILED: Category with linked scenario was deleted without constraint blockage!';
  END IF;

  RAISE NOTICE 'CHECK 4 PASSED: Deleting a category with linked scenarios is strictly blocked.';
END $$;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'TEST 5: IT SUPPORT IS BLOCKED FROM USER ADMINISTRATION'
\echo '-------------------------------------------------------------'
DO $$
DECLARE
  v_support_id UUID;
  v_target_id  UUID;
  v_blocked    BOOLEAN := false;
BEGIN
  SELECT id INTO v_support_id FROM pb_user_profiles WHERE role = 'IT Support' LIMIT 1;
  SELECT id INTO v_target_id FROM pb_user_profiles WHERE role = 'Admin' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_support_id::text, true);

  -- 5a. IT Support attempts to modify user profile (MUST FAIL / NOT UPDATE)
  UPDATE pb_user_profiles SET role = 'Admin' WHERE id = v_target_id;
  IF FOUND THEN
    RAISE EXCEPTION 'TEST FAILED: IT Support was able to modify a user profile!';
  END IF;

  -- 5b. IT Support attempts to call admin RPC
  BEGIN
    PERFORM admin_update_user_status(v_target_id, 'Tampered Name', 'Admin', true);
  EXCEPTION WHEN others THEN
    v_blocked := true;
  END;

  RESET ROLE;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'TEST FAILED: IT Support called admin_update_user_status without blockage!';
  END IF;

  RAISE NOTICE 'CHECK 5 PASSED: IT Support is blocked from User Administration.';
END $$;

COMMIT;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'ALL SECTION 8 ACCEPTANCE TESTS PASSED'
\echo '-------------------------------------------------------------'
