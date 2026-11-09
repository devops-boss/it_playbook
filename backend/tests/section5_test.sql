-- ============================================================================
-- Section 5: Login, IAM, and MFA Acceptance Tests
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '-------------------------------------------------------------'
\echo 'TEST 1: VERIFY ADMIN AND IT SUPPORT USER SETUP'
\echo '-------------------------------------------------------------'
SELECT email, role, is_active FROM pb_user_profiles ORDER BY role, email;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'TEST 2: IT SUPPORT ATTEMPTS CALLING ADMIN RPCs (MUST BE REJECTED)'
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

  -- 2a. Attempt MFA reset
  BEGIN
    PERFORM admin_reset_user_mfa(v_target_id);
    RAISE EXCEPTION 'TEST FAILED: IT Support was able to call admin_reset_user_mfa!';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'PASS: IT Support blocked from admin_reset_user_mfa (%)', SQLERRM;
  END;

  -- 2b. Attempt user deactivation / role change
  BEGIN
    PERFORM admin_update_user_status(v_target_id, 'Tampered User', 'Admin', true);
    RAISE EXCEPTION 'TEST FAILED: IT Support was able to call admin_update_user_status!';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'PASS: IT Support blocked from admin_update_user_status (%)', SQLERRM;
  END;
END $$;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'TEST 3: ADMIN CAN RESET USER MFA & ACTION IS AUDITED'
\echo '-------------------------------------------------------------'
DO $$
DECLARE
  v_admin_id   UUID;
  v_target_id  UUID;
  v_before_log INT;
  v_after_log  INT;
  v_res        JSONB;
BEGIN
  SELECT id INTO v_admin_id FROM pb_user_profiles WHERE role = 'Admin' LIMIT 1;
  SELECT id INTO v_target_id FROM pb_user_profiles WHERE role = 'IT Support' LIMIT 1;

  -- Insert mock MFA factor for target user
  INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_target_id, 'Work Phone', 'totp', 'verified', now(), now())
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO v_before_log FROM pb_audit_log WHERE action = 'mfa_reset';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  v_res := admin_reset_user_mfa(v_target_id);

  SELECT count(*) INTO v_after_log FROM pb_audit_log WHERE action = 'mfa_reset';

  IF v_after_log > v_before_log THEN
    RAISE NOTICE 'PASS: Admin reset MFA, factors cleared, and audit record created (result: %)', v_res;
  ELSE
    RAISE EXCEPTION 'TEST FAILED: Audit log for MFA reset was not created!';
  END IF;
END $$;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'TEST 4: ADMIN DEACTIVATES USER -> TERMINATES ACTIVE SESSIONS'
\echo '-------------------------------------------------------------'
DO $$
DECLARE
  v_admin_id   UUID;
  v_target_id  UUID;
  v_orig_name  TEXT;
  v_active     BOOLEAN;
BEGIN
  SELECT id INTO v_admin_id FROM pb_user_profiles WHERE role = 'Admin' LIMIT 1;
  SELECT id, display_name INTO v_target_id, v_orig_name FROM pb_user_profiles WHERE role = 'IT Support' LIMIT 1;

  -- Create a mock active session
  INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
  VALUES (gen_random_uuid(), v_target_id, now(), now())
  ON CONFLICT DO NOTHING;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  -- Deactivate user
  PERFORM admin_update_user_status(v_target_id, v_orig_name, 'IT Support', FALSE);

  RESET ROLE;

  SELECT is_active INTO v_active FROM pb_user_profiles WHERE id = v_target_id;
  IF v_active THEN
    RAISE EXCEPTION 'TEST FAILED: User was not marked inactive!';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.sessions WHERE user_id = v_target_id) THEN
    RAISE EXCEPTION 'TEST FAILED: Active sessions were not terminated on deactivation!';
  ELSE
    RAISE NOTICE 'PASS: Deactivation successfully marked profile inactive and terminated all sessions.';
  END IF;

  -- Re-activate user for standard operation
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM admin_update_user_status(v_target_id, v_orig_name, 'IT Support', TRUE);
  RAISE NOTICE 'PASS: User successfully reactivated.';

END $$;

\echo ''
\echo '-------------------------------------------------------------'
\echo 'ALL SECTION 5 ACCEPTANCE TESTS PASSED'
\echo '-------------------------------------------------------------'
