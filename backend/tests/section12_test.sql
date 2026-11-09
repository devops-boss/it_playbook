-- ============================================================================
-- Section 12 Test Suite: Search & Filters Acceptance Tests
-- Big Outsource IT Operations Playbook
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Test 1: Search by title ('Internet Down') returns scenario
DO $$
DECLARE
  v_title TEXT;
  v_rank REAL;
BEGIN
  SELECT title, rank INTO v_title, v_rank
  FROM search_scenarios(p_query := 'Internet Down')
  LIMIT 1;

  IF v_title IS NULL OR v_title NOT ILIKE '%Internet Down%' THEN
    RAISE EXCEPTION 'Test 1 Failed: Expected Internet Down scenario, got %', v_title;
  END IF;

  RAISE NOTICE 'Test 1 Passed: Search by title found "%" with rank %', v_title, v_rank;
END $$;

-- Test 2: Search by full HESK ticket tracking ID ('BOS-49281')
DO $$
DECLARE
  v_slug TEXT;
  v_tickets TEXT[];
BEGIN
  SELECT slug, sample_ticket_ids INTO v_slug, v_tickets
  FROM search_scenarios(p_query := 'BOS-49281')
  LIMIT 1;

  IF v_slug <> 'internet-down-isp-failover' THEN
    RAISE EXCEPTION 'Test 2 Failed: Expected internet-down-isp-failover for ticket BOS-49281, got %', v_slug;
  END IF;

  IF NOT ('BOS-49281' = ANY(v_tickets)) THEN
    RAISE EXCEPTION 'Test 2 Failed: Expected ticket BOS-49281 in sample_ticket_ids, got %', v_tickets;
  END IF;

  RAISE NOTICE 'Test 2 Passed: Full HESK ticket ID search matched "%" (tickets: %)', v_slug, v_tickets;
END $$;

-- Test 3: Search by numeric HESK ticket tracking ID ('49281')
DO $$
DECLARE
  v_slug TEXT;
BEGIN
  SELECT slug INTO v_slug
  FROM search_scenarios(p_query := '49281')
  LIMIT 1;

  IF v_slug <> 'internet-down-isp-failover' THEN
    RAISE EXCEPTION 'Test 3 Failed: Numeric ticket query 49281 did not match Internet Down, got %', v_slug;
  END IF;

  RAISE NOTICE 'Test 3 Passed: Numeric HESK ticket ID search matched "%"', v_slug;
END $$;

-- Test 4: Search by account name ('MyVRhost')
DO $$
DECLARE
  v_slug TEXT;
BEGIN
  SELECT slug INTO v_slug
  FROM search_scenarios(p_query := 'MyVRhost')
  LIMIT 1;

  IF v_slug <> 'wifi-vpn-connectivity-failure' THEN
    RAISE EXCEPTION 'Test 4 Failed: Expected wifi-vpn-connectivity-failure for MyVRhost, got %', v_slug;
  END IF;

  RAISE NOTICE 'Test 4 Passed: Account name search matched "%"', v_slug;
END $$;

-- Test 5: Search by account code ('MVRH')
DO $$
DECLARE
  v_slug TEXT;
BEGIN
  SELECT slug INTO v_slug
  FROM search_scenarios(p_query := 'MVRH')
  LIMIT 1;

  IF v_slug <> 'wifi-vpn-connectivity-failure' THEN
    RAISE EXCEPTION 'Test 5 Failed: Expected wifi-vpn-connectivity-failure for MVRH code, got %', v_slug;
  END IF;

  RAISE NOTICE 'Test 5 Passed: Account code search matched "%"', v_slug;
END $$;

-- Test 6: Search by category name ('Teams')
DO $$
DECLARE
  v_slug TEXT;
BEGIN
  SELECT slug INTO v_slug
  FROM search_scenarios(p_query := 'Teams')
  LIMIT 1;

  IF v_slug <> 'ms-teams-audio-video-lag' THEN
    RAISE EXCEPTION 'Test 6 Failed: Expected ms-teams-audio-video-lag for Teams, got %', v_slug;
  END IF;

  RAISE NOTICE 'Test 6 Passed: Category name search matched "%"', v_slug;
END $$;

-- Test 7: Filter by category ID narrows results
DO $$
DECLARE
  v_cat_id UUID;
  v_count INT;
BEGIN
  SELECT id INTO v_cat_id FROM pb_categories WHERE slug = 'internet-down' LIMIT 1;

  SELECT count(*) INTO v_count
  FROM search_scenarios(p_category_ids := ARRAY[v_cat_id]);

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Test 7 Failed: Expected exactly 1 scenario for Internet Down category filter, found %', v_count;
  END IF;

  RAISE NOTICE 'Test 7 Passed: Category filter narrowed results to exactly % scenario.', v_count;
END $$;

-- Test 8: Non-existent search query returns 0 rows
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM search_scenarios(p_query := 'xyznonexistentterm9999');

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Test 8 Failed: Expected 0 results for non-existent term, got %', v_count;
  END IF;

  RAISE NOTICE 'Test 8 Passed: Non-existent search cleanly returns 0 results.';
END $$;

ROLLBACK;

SELECT 'SECTION 12 SEARCH & FILTERS ACCEPTANCE SUITE PASSED SUCCESSFULLY' AS status;
