-- ============================================================================
-- Section 6 Acceptance Tests: Real Accounts and Real Users
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1. Verify account count is exactly 26
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pb_accounts;
  IF v_count <> 26 THEN
    RAISE EXCEPTION 'Expected 26 accounts, found %', v_count;
  END IF;
  RAISE NOTICE 'CHECK 1 PASSED: Exactly 26 accounts found in pb_accounts';
END $$;

-- 2. Verify all 26 accounts have non-null code, name, and valid hex accent_color
DO $$
DECLARE
  v_invalid INT;
BEGIN
  SELECT COUNT(*) INTO v_invalid
  FROM pb_accounts
  WHERE name IS NULL OR code IS NULL OR accent_color !~ '^#[0-9A-Fa-f]{6}$';

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'Found % accounts with invalid name/code/accent_color', v_invalid;
  END IF;
  RAISE NOTICE 'CHECK 2 PASSED: All 26 accounts have valid names, codes, and hex brand colors';
END $$;

-- 3. Verify exactly 8 real users in auth.users and pb_user_profiles
DO $$
DECLARE
  v_auth_count INT;
  v_profile_count INT;
BEGIN
  SELECT COUNT(*) INTO v_auth_count FROM auth.users WHERE email LIKE '%@bigoutsource.%';
  SELECT COUNT(*) INTO v_profile_count FROM pb_user_profiles;

  IF v_auth_count <> 8 THEN
    RAISE EXCEPTION 'Expected 8 users in auth.users, found %', v_auth_count;
  END IF;
  IF v_profile_count <> 8 THEN
    RAISE EXCEPTION 'Expected 8 profiles in pb_user_profiles, found %', v_profile_count;
  END IF;
  RAISE NOTICE 'CHECK 3 PASSED: Exactly 8 real users exist in auth.users and pb_user_profiles';
END $$;

-- 4. Verify Reinier Vista and Ronald Balza are Admins, and other 6 are IT Support
DO $$
DECLARE
  v_admin_count INT;
  v_support_count INT;
  v_reinier_role TEXT;
  v_ronald_role TEXT;
BEGIN
  SELECT role INTO v_reinier_role FROM pb_user_profiles WHERE email = 'paulreinier.vista@bigoutsource.com';
  SELECT role INTO v_ronald_role FROM pb_user_profiles WHERE email = 'ronald.balza@bigoutsource.com';

  IF v_reinier_role <> 'Admin' THEN
    RAISE EXCEPTION 'Reinier Vista role should be Admin, found %', v_reinier_role;
  END IF;
  IF v_ronald_role <> 'Admin' THEN
    RAISE EXCEPTION 'Ronald Balza role should be Admin, found %', v_ronald_role;
  END IF;

  SELECT COUNT(*) INTO v_admin_count FROM pb_user_profiles WHERE role = 'Admin';
  SELECT COUNT(*) INTO v_support_count FROM pb_user_profiles WHERE role = 'IT Support';

  IF v_admin_count <> 2 THEN
    RAISE EXCEPTION 'Expected exactly 2 Admins, found %', v_admin_count;
  END IF;
  IF v_support_count <> 6 THEN
    RAISE EXCEPTION 'Expected exactly 6 IT Support users, found %', v_support_count;
  END IF;
  RAISE NOTICE 'CHECK 4 PASSED: Reinier Vista & Ronald Balza are Admin; exactly 6 users are IT Support';
END $$;

-- 5. Verify no leftover demo/sample accounts or test users
DO $$
DECLARE
  v_sample_accts INT;
  v_sample_users INT;
BEGIN
  SELECT COUNT(*) INTO v_sample_accts FROM pb_accounts WHERE code IN ('NWL', 'CRH', 'HLC', 'ALPHA', 'BETA');
  SELECT COUNT(*) INTO v_sample_users FROM auth.users WHERE email IN ('admin@bosp.local', 'editor@bosp.local', 'agent@bosp.local');

  IF v_sample_accts > 0 THEN
    RAISE EXCEPTION 'Found % leftover sample accounts', v_sample_accts;
  END IF;
  IF v_sample_users > 0 THEN
    RAISE EXCEPTION 'Found % leftover sample users', v_sample_users;
  END IF;
  RAISE NOTICE 'CHECK 5 PASSED: Zero sample accounts or demo users remaining';
END $$;

-- 6. Verify each user has access to all 26 accounts in pb_user_accounts
DO $$
DECLARE
  v_mapping_count INT;
BEGIN
  SELECT COUNT(*) INTO v_mapping_count FROM pb_user_accounts;
  IF v_mapping_count <> (8 * 26) THEN
    RAISE EXCEPTION 'Expected % user-account mappings (8 * 26), found %', (8 * 26), v_mapping_count;
  END IF;
  RAISE NOTICE 'CHECK 6 PASSED: All 8 users are mapped to all 26 accounts in pb_user_accounts (208 total)';
END $$;

COMMIT;
