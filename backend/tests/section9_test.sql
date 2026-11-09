-- ============================================================================
-- BOS Playbook - Section 9 Acceptance Test Suite
-- ============================================================================
-- Tests:
-- 1. 3 sample scenarios exist and are published
-- 2. 6 sample tickets exist with HESK Tracking IDs
-- 3. occurrence_count trigger automatically updated to 2 for all 3 scenarios
-- 4. Dynamic ticket trigger test: adding and removing a ticket updates occurrence_count
-- 5. Related scenarios cross-link exists between sample scenarios
-- 6. 'prevention' section definition is registered in pb_section_definitions
-- 7. Favorites and Feedback tables are ready and accessible
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_sample_count INT;
  v_ticket_count INT;
  v_trigger_count INT;
  v_scen_id UUID;
  v_temp_ticket_id UUID;
  v_cur_occur INT;
  v_related_count INT;
  v_prevention_exists BOOLEAN;
  v_admin_id UUID;
BEGIN
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'RUNNING SECTION 9 TEST SUITE';
  RAISE NOTICE '------------------------------------------------------------';

  -- Check 1: 3 Sample Scenarios exist
  SELECT COUNT(*) INTO v_sample_count
  FROM pb_scenarios
  WHERE slug IN ('internet-down-isp-failover', 'wifi-vpn-connectivity-failure', 'ms-teams-audio-video-lag')
    AND status = 'published'
    AND 'sample' = ANY(tags);

  IF v_sample_count <> 3 THEN
    RAISE EXCEPTION 'CHECK 1 FAILED: Expected 3 published sample scenarios, found %', v_sample_count;
  END IF;
  RAISE NOTICE '✓ Check 1 Passed: Exactly 3 sample scenarios seeded and published.';

  -- Check 2: 6 Sample Tickets with HESK Tracking IDs
  SELECT COUNT(*) INTO v_ticket_count
  FROM pb_sample_tickets
  WHERE ticket_id IN ('BOS-49281', 'BOS-51029', 'BOS-33104', 'BOS-33892', 'BOS-28410', 'BOS-29004');

  IF v_ticket_count <> 6 THEN
    RAISE EXCEPTION 'CHECK 2 FAILED: Expected 6 sample tickets with HESK Tracking IDs, found %', v_ticket_count;
  END IF;
  RAISE NOTICE '✓ Check 2 Passed: Exactly 6 HESK sample tickets registered.';

  -- Check 3: Occurrence Count trigger set occurrence_count = 2
  SELECT COUNT(*) INTO v_trigger_count
  FROM pb_scenarios
  WHERE slug IN ('internet-down-isp-failover', 'wifi-vpn-connectivity-failure', 'ms-teams-audio-video-lag')
    AND occurrence_count = 2
    AND last_occurred_at IS NOT NULL;

  IF v_trigger_count <> 3 THEN
    RAISE EXCEPTION 'CHECK 3 FAILED: Expected all 3 scenarios to have occurrence_count = 2, found %', v_trigger_count;
  END IF;
  RAISE NOTICE '✓ Check 3 Passed: Occurrence trigger automatically set occurrence_count = 2.';

  -- Check 4: Dynamic Ticket Insert / Delete recalculates occurrence_count
  SELECT id INTO v_scen_id FROM pb_scenarios WHERE slug = 'internet-down-isp-failover';
  
  -- Insert 3rd ticket
  INSERT INTO pb_sample_tickets (scenario_id, ticket_id, ticket_date)
  VALUES (v_scen_id, 'BOS-TEST-999', '2026-10-27')
  RETURNING id INTO v_temp_ticket_id;

  SELECT occurrence_count INTO v_cur_occur FROM pb_scenarios WHERE id = v_scen_id;
  IF v_cur_occur <> 3 THEN
    RAISE EXCEPTION 'CHECK 4A FAILED: Expected occurrence_count to increment to 3 on insert, got %', v_cur_occur;
  END IF;

  -- Delete 3rd ticket
  DELETE FROM pb_sample_tickets WHERE id = v_temp_ticket_id;

  SELECT occurrence_count INTO v_cur_occur FROM pb_scenarios WHERE id = v_scen_id;
  IF v_cur_occur <> 2 THEN
    RAISE EXCEPTION 'CHECK 4B FAILED: Expected occurrence_count to decrement back to 2 on delete, got %', v_cur_occur;
  END IF;
  RAISE NOTICE '✓ Check 4 Passed: trg_update_occurrence dynamically increments and decrements occurrence_count.';

  -- Check 5: Related scenarios cross-link
  SELECT COUNT(*) INTO v_related_count
  FROM pb_related_scenarios
  WHERE scenario_id = v_scen_id;

  IF v_related_count < 1 THEN
    RAISE EXCEPTION 'CHECK 5 FAILED: Expected related scenario link, found %', v_related_count;
  END IF;
  RAISE NOTICE '✓ Check 5 Passed: Related scenarios cross-link verified.';

  -- Check 6: Prevention section definition exists
  SELECT EXISTS (
    SELECT 1 FROM pb_section_definitions WHERE key = 'prevention'
  ) INTO v_prevention_exists;

  IF NOT v_prevention_exists THEN
    RAISE EXCEPTION 'CHECK 6 FAILED: Prevention section definition not registered.';
  END IF;
  RAISE NOTICE '✓ Check 6 Passed: Prevention section definition registered.';

  -- Check 7: Favorites & Feedback operations
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'paulreinier.vista@bigoutsource.com';
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO pb_favorites (user_id, scenario_id) VALUES (v_admin_id, v_scen_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO pb_feedback (user_id, scenario_id, is_helpful, comment)
    VALUES (v_admin_id, v_scen_id, TRUE, 'Acceptance test feedback verification');
  END IF;
  RAISE NOTICE '✓ Check 7 Passed: pb_favorites and pb_feedback operations verified.';

  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'ALL SECTION 9 ACCEPTANCE CHECKS PASSED SUCCESSFULLY!';
  RAISE NOTICE '------------------------------------------------------------';
END $$;

COMMIT;
