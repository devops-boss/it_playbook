-- ============================================================================
-- Section 14 Test Suite: Backups, Operations & Disaster Recovery Verification
-- Big Outsource IT Operations Playbook
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Test 1: Verify all 26 accounts and 8 users are present and healthy
DO $$
DECLARE
  v_accounts INT;
  v_users INT;
  v_admins INT;
  v_it_support INT;
BEGIN
  SELECT count(*) INTO v_accounts FROM pb_accounts WHERE status = 'Active';
  IF v_accounts <> 26 THEN
    RAISE EXCEPTION 'Test 1 Failed: Expected 26 active accounts, found %', v_accounts;
  END IF;

  SELECT count(*) INTO v_users FROM pb_user_profiles WHERE is_active = TRUE;
  IF v_users <> 8 THEN
    RAISE EXCEPTION 'Test 1 Failed: Expected 8 active users, found %', v_users;
  END IF;

  SELECT count(*) INTO v_admins FROM pb_user_profiles WHERE role = 'Admin' AND is_active = TRUE;
  IF v_admins <> 2 THEN
    RAISE EXCEPTION 'Test 1 Failed: Expected 2 Admins (Reinier Vista & Ronald Balza), found %', v_admins;
  END IF;

  SELECT count(*) INTO v_it_support FROM pb_user_profiles WHERE role = 'IT Support' AND is_active = TRUE;
  IF v_it_support <> 6 THEN
    RAISE EXCEPTION 'Test 1 Failed: Expected 6 IT Support staff, found %', v_it_support;
  END IF;

  RAISE NOTICE 'Test 1 Passed: 26 active client accounts and 8 real users (2 Admins, 6 IT Support) verified.';
END $$;

-- Test 2: Verify export_config() returns comprehensive JSON configuration
DO $$
DECLARE
  v_config JSONB;
  v_keys TEXT[];
BEGIN
  SELECT export_config() INTO v_config;
  IF v_config IS NULL THEN
    RAISE EXCEPTION 'Test 2 Failed: export_config() returned NULL';
  END IF;

  IF NOT (v_config ? 'categories' AND v_config ? 'criteria_fields' AND v_config ? 'settings') THEN
    RAISE EXCEPTION 'Test 2 Failed: export_config() missing essential configuration sections';
  END IF;

  RAISE NOTICE 'Test 2 Passed: export_config() successfully exports valid JSON configuration.';
END $$;

-- Test 3: Verify core extensions are active and operational
DO $$
DECLARE
  v_ext_count INT;
BEGIN
  SELECT count(*) INTO v_ext_count
  FROM pg_extension
  WHERE extname IN ('pg_trgm', 'unaccent', 'pgcrypto');

  IF v_ext_count < 3 THEN
    RAISE EXCEPTION 'Test 3 Failed: Required extensions (pg_trgm, unaccent, pgcrypto) not all present (found %)', v_ext_count;
  END IF;

  RAISE NOTICE 'Test 3 Passed: Required database extensions verified active.';
END $$;

-- Test 4: Verify search vector trigger integrity across scenarios
DO $$
DECLARE
  v_searchable INT;
  v_total INT;
BEGIN
  SELECT count(*) INTO v_total FROM pb_scenarios WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_searchable FROM pb_scenarios WHERE deleted_at IS NULL AND search_vector IS NOT NULL;

  IF v_searchable <> v_total THEN
    RAISE EXCEPTION 'Test 4 Failed: Expected % indexed scenarios, found %', v_total, v_searchable;
  END IF;

  RAISE NOTICE 'Test 4 Passed: Full-text search search_vector columns intact across all % scenarios.', v_total;
END $$;

-- Test 5: Verify RLS security policies enabled across all pb_* tables
DO $$
DECLARE
  v_unprotected_tables INT;
BEGIN
  SELECT count(*) INTO v_unprotected_tables
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename LIKE 'pb_%'
    AND tablename <> 'pb_migrations'
    AND rowsecurity = FALSE;

  IF v_unprotected_tables > 0 THEN
    RAISE EXCEPTION 'Test 5 Failed: Found % tables in public without Row Level Security', v_unprotected_tables;
  END IF;

  RAISE NOTICE 'Test 5 Passed: Row Level Security is active on 100%% of pb_* tables.';
END $$;

ROLLBACK;

SELECT 'SECTION 14 OPERATIONS & DATABASE INTEGRITY ACCEPTANCE SUITE PASSED SUCCESSFULLY' as status;
