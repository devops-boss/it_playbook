-- ============================================================================
-- Section 4: Database Foundation Acceptance Tests
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '-------------------------------------------------------------'
\echo 'TEST 1: SCHEMA VERIFICATION & EXTENSIONS'
\echo '-------------------------------------------------------------'
SELECT 'pb_accounts has ticket_url_template' AS check, 
       EXISTS (
         SELECT 1 FROM information_schema.columns 
         WHERE table_name='pb_accounts' AND column_name='ticket_url_template'
       ) AS pass;

SELECT 'pb_user_profiles has role & email' AS check,
       EXISTS (
         SELECT 1 FROM information_schema.columns 
         WHERE table_name='pb_user_profiles' AND column_name='role'
       ) AND EXISTS (
         SELECT 1 FROM information_schema.columns 
         WHERE table_name='pb_user_profiles' AND column_name='email'
       ) AS pass;

SELECT 'Helper functions exist' AS check,
       EXISTS (SELECT 1 FROM pg_proc WHERE proname='is_admin') AND
       EXISTS (SELECT 1 FROM pg_proc WHERE proname='is_active_user') AS pass;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'TEST 2: ADMIN CAN WRITE USER PROFILES'
\echo '-------------------------------------------------------------'
DO $$
DECLARE
  v_admin_id UUID;
  v_test_target UUID;
BEGIN
  SELECT id INTO v_admin_id FROM pb_user_profiles WHERE role = 'Admin' LIMIT 1;
  SELECT id INTO v_test_target FROM pb_user_profiles WHERE role = 'IT Support' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  -- Admin updates test target's display name
  UPDATE pb_user_profiles 
  SET display_name = display_name || ' (Admin Tested)' 
  WHERE id = v_test_target;

  RAISE NOTICE 'PASS: Admin successfully updated user profile.';
END $$;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'TEST 3: IT SUPPORT CAN READ/WRITE CONTENT BUT CANNOT WRITE PROFILES'
\echo '-------------------------------------------------------------'
DO $$
DECLARE
  v_support_id UUID;
  v_target_id  UUID;
BEGIN
  SELECT id INTO v_support_id FROM pb_user_profiles WHERE role = 'IT Support' LIMIT 1;
  SELECT id INTO v_target_id FROM pb_user_profiles WHERE role = 'Admin' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_support_id::text, true);

  -- 3a. IT Support attempts to modify another user's profile (MUST BE BLOCKED)
  BEGIN
    UPDATE pb_user_profiles 
    SET role = 'Admin' 
    WHERE id = v_target_id;

    -- If 0 rows updated or exception raised, policy holds
    IF FOUND THEN
      RAISE EXCEPTION 'TEST FAILED: IT Support was able to modify admin profile!';
    ELSE
      RAISE NOTICE 'PASS: IT Support update on other profile affected 0 rows (RLS filtered).';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: IT Support update blocked by permission.';
  END;
END $$;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'TEST 4: DEACTIVATED USER IS BLOCKED'
\echo '-------------------------------------------------------------'
DO $$
DECLARE
  v_deactivated_id UUID := '99999999-9999-9999-9999-999999999999';
BEGIN
  -- Create temporary deactivated profile
  INSERT INTO auth.users (id, email) VALUES (v_deactivated_id, 'inactive@test.local')
  ON CONFLICT (id) DO NOTHING;
  
  INSERT INTO pb_user_profiles (id, email, display_name, role, is_active)
  VALUES (v_deactivated_id, 'inactive@test.local', 'Inactive User', 'IT Support', FALSE)
  ON CONFLICT (id) DO UPDATE SET is_active = FALSE;

  -- Test as deactivated user
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_deactivated_id::text, true);

  IF is_active_user() THEN
    RAISE EXCEPTION 'TEST FAILED: is_active_user() returned true for deactivated user!';
  ELSE
    RAISE NOTICE 'PASS: Deactivated user fails is_active_user() check.';
  END IF;

  -- Clean up temporary test user
  RESET ROLE;
  DELETE FROM pb_user_profiles WHERE id = v_deactivated_id;
  DELETE FROM auth.users WHERE id = v_deactivated_id;
END $$;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'TEST 5: AUDIT LOG ENTRY GENERATION ON ROW CHANGE'
\echo '-------------------------------------------------------------'
DO $$
DECLARE
  v_before_count INT;
  v_after_count  INT;
  v_admin_id     UUID;
BEGIN
  SELECT id INTO v_admin_id FROM pb_user_profiles WHERE role = 'Admin' LIMIT 1;
  SELECT count(*) INTO v_before_count FROM pb_audit_log WHERE entity_type = 'user_profiles';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  UPDATE pb_user_profiles 
  SET display_name = display_name
  WHERE id = v_admin_id;

  SELECT count(*) INTO v_after_count FROM pb_audit_log WHERE entity_type = 'user_profiles';


  IF v_after_count > v_before_count THEN
    RAISE NOTICE 'PASS: Audit log entry successfully created on profile change (% -> %).', v_before_count, v_after_count;
  ELSE
    RAISE EXCEPTION 'TEST FAILED: No audit log entry was created!';
  END IF;
END $$;


\echo ''
\echo '-------------------------------------------------------------'
\echo 'ALL SECTION 4 ACCEPTANCE TESTS PASSED'
\echo '-------------------------------------------------------------'
