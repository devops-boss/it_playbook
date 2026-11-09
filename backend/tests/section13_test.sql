-- ============================================================================
-- Section 13 Test Suite: Account Views & Coverage Matrix Acceptance Tests
-- Big Outsource IT Operations Playbook
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Test 1: Verify get_all_account_metrics() returns exactly 26 client accounts
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM get_all_account_metrics();

  IF v_count <> 26 THEN
    RAISE EXCEPTION 'Test 1 Failed: Expected 26 accounts in metrics, found %', v_count;
  END IF;

  RAISE NOTICE 'Test 1 Passed: Exactly 26 client accounts verified in get_all_account_metrics().';
END $$;

-- Test 2: Verify all 26 accounts have global SOP coverage
DO $$
DECLARE
  v_missing INT;
BEGIN
  SELECT count(*) INTO v_missing
  FROM get_all_account_metrics()
  WHERE global_playbooks < 1;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Test 2 Failed: Found % accounts without global SOP coverage', v_missing;
  END IF;

  RAISE NOTICE 'Test 2 Passed: All 26 accounts have global SOP playbook access.';
END $$;

-- Test 3: Verify dedicated account-specific playbooks for MyVRhost and Imagine Learning
DO $$
DECLARE
  v_mvrh_total INT;
  v_mvrh_dedicated INT;
  v_il_total INT;
  v_il_dedicated INT;
BEGIN
  SELECT total_playbooks, account_specific_playbooks
  INTO v_mvrh_total, v_mvrh_dedicated
  FROM get_all_account_metrics()
  WHERE account_code = 'MVRH';

  IF v_mvrh_total < 2 OR v_mvrh_dedicated < 1 THEN
    RAISE EXCEPTION 'Test 3 Failed: MyVRhost expected total >= 2, dedicated >= 1 (got total %, dedicated %)', v_mvrh_total, v_mvrh_dedicated;
  END IF;

  SELECT total_playbooks, account_specific_playbooks
  INTO v_il_total, v_il_dedicated
  FROM get_all_account_metrics()
  WHERE account_code = 'IL';

  IF v_il_total < 2 OR v_il_dedicated < 1 THEN
    RAISE EXCEPTION 'Test 3 Failed: Imagine Learning expected total >= 2, dedicated >= 1 (got total %, dedicated %)', v_il_total, v_il_dedicated;
  END IF;

  RAISE NOTICE 'Test 3 Passed: Dedicated playbooks verified for MVRH (total %, dedicated %) and IL (total %, dedicated %)',
    v_mvrh_total, v_mvrh_dedicated, v_il_total, v_il_dedicated;
END $$;

-- Test 4: Verify get_account_playbook for MyVRhost
DO $$
DECLARE
  v_acc_id UUID;
  v_count INT;
  v_has_tickets BOOLEAN;
BEGIN
  SELECT id INTO v_acc_id FROM pb_accounts WHERE code = 'MVRH';

  SELECT count(*), bool_or(cardinality(sample_ticket_ids) > 0)
  INTO v_count, v_has_tickets
  FROM get_account_playbook(v_acc_id, 'all');

  IF v_count < 2 THEN
    RAISE EXCEPTION 'Test 4 Failed: Expected at least 2 playbooks for MyVRhost, got %', v_count;
  END IF;

  IF NOT v_has_tickets THEN
    RAISE EXCEPTION 'Test 4 Failed: Expected sample_ticket_ids on MyVRhost playbooks';
  END IF;

  RAISE NOTICE 'Test 4 Passed: get_account_playbook returned % playbooks with HESK tickets for MyVRhost.', v_count;
END $$;

-- Test 5: Verify get_account_metrics single account RPC
DO $$
DECLARE
  v_acc_id UUID;
  v_total BIGINT;
  v_name TEXT;
BEGIN
  SELECT id INTO v_acc_id FROM pb_accounts WHERE code = 'MVRH';

  SELECT total_playbooks, account_name INTO v_total, v_name
  FROM get_account_metrics(v_acc_id);

  IF v_total < 2 OR v_name <> 'MyVRhost' THEN
    RAISE EXCEPTION 'Test 5 Failed: Unexpected get_account_metrics result (name %, total %)', v_name, v_total;
  END IF;

  RAISE NOTICE 'Test 5 Passed: get_account_metrics returned % playbooks for %.', v_total, v_name;
END $$;

-- Test 6: Verify get_coverage_matrix('category', 'account')
DO $$
DECLARE
  v_cell_count INT;
  v_covered_cells INT;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE count > 0)
  INTO v_cell_count, v_covered_cells
  FROM get_coverage_matrix('category', 'account');

  IF v_cell_count = 0 THEN
    RAISE EXCEPTION 'Test 6 Failed: Coverage matrix returned 0 cells';
  END IF;

  IF v_covered_cells = 0 THEN
    RAISE EXCEPTION 'Test 6 Failed: Coverage matrix shows 0 covered cells';
  END IF;

  RAISE NOTICE 'Test 6 Passed: Coverage matrix returned % cells (% covered combinations).', v_cell_count, v_covered_cells;
END $$;

ROLLBACK;

SELECT 'SECTION 13 ACCOUNT VIEWS & COVERAGE MATRIX ACCEPTANCE SUITE PASSED SUCCESSFULLY' AS status;
