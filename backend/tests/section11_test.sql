-- ============================================================================
-- Section 11 Test Suite: Flowchart Enhancements & Database Validation
-- Big Outsource IT Operations Playbook
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Test 1: Verify all 7 standard node types exist with BOS branding
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM pb_node_types
  WHERE key IN ('start', 'action', 'decision', 'workaround', 'resolution', 'escalate', 'end');

  IF v_count <> 7 THEN
    RAISE EXCEPTION 'Test 1 Failed: Expected 7 node types, found %', v_count;
  END IF;

  -- Verify colors
  IF NOT EXISTS (SELECT 1 FROM pb_node_types WHERE key = 'action' AND color = '#233B74') THEN
    RAISE EXCEPTION 'Test 1 Failed: Action node does not have #233B74 brand color';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pb_node_types WHERE key = 'decision' AND color = '#E07E3C') THEN
    RAISE EXCEPTION 'Test 1 Failed: Decision node does not have #E07E3C brand color';
  END IF;

  RAISE NOTICE 'Test 1 Passed: 7 BOS node types verified.';
END $$;

-- Test 2: Seeded flowchart exists for internet-down-isp-failover
DO $$
DECLARE
  v_nodes INT;
  v_edges INT;
BEGIN
  SELECT jsonb_array_length(f.nodes), jsonb_array_length(f.edges)
  INTO v_nodes, v_edges
  FROM pb_flowcharts f
  JOIN pb_scenarios s ON s.id = f.scenario_id
  WHERE s.slug = 'internet-down-isp-failover';

  IF v_nodes < 6 THEN
    RAISE EXCEPTION 'Test 2 Failed: Seeded flowchart has % nodes, expected at least 6', v_nodes;
  END IF;
  IF v_edges < 5 THEN
    RAISE EXCEPTION 'Test 2 Failed: Seeded flowchart has % edges, expected at least 5', v_edges;
  END IF;

  RAISE NOTICE 'Test 2 Passed: Seeded flowchart verified with % nodes and % edges.', v_nodes, v_edges;
END $$;

-- Test 3: Validation rejects flowchart with missing Start step
DO $$
DECLARE
  v_scenario_id UUID;
  v_error_caught BOOLEAN := FALSE;
BEGIN
  SELECT id INTO v_scenario_id FROM pb_scenarios WHERE slug = 'wifi-vpn-connectivity-failure';

  BEGIN
    INSERT INTO pb_flowcharts (scenario_id, nodes, edges)
    VALUES (
      v_scenario_id,
      '[{"id": "n-act", "data": {"nodeType": "action", "label": "No Start Node"}}]'::jsonb,
      '[]'::jsonb
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_error_caught := TRUE;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'Test 3 Failed: Flowchart without Start node was unexpectedly allowed!';
  END IF;

  RAISE NOTICE 'Test 3 Passed: Missing Start step correctly rejected.';
END $$;

-- Test 4: Validation rejects flowchart with multiple Start steps
DO $$
DECLARE
  v_scenario_id UUID;
  v_error_caught BOOLEAN := FALSE;
BEGIN
  SELECT id INTO v_scenario_id FROM pb_scenarios WHERE slug = 'wifi-vpn-connectivity-failure';

  BEGIN
    INSERT INTO pb_flowcharts (scenario_id, nodes, edges)
    VALUES (
      v_scenario_id,
      '[
        {"id": "n1", "data": {"nodeType": "start", "label": "Start 1"}},
        {"id": "n2", "data": {"nodeType": "start", "label": "Start 2"}},
        {"id": "n3", "data": {"nodeType": "end", "label": "End"}}
      ]'::jsonb,
      '[{"id": "e1", "source": "n1", "target": "n3"}, {"id": "e2", "source": "n2", "target": "n3"}]'::jsonb
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_error_caught := TRUE;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'Test 4 Failed: Flowchart with multiple Start steps was unexpectedly allowed!';
  END IF;

  RAISE NOTICE 'Test 4 Passed: Multiple Start steps correctly rejected.';
END $$;

-- Test 5: Validation rejects flowchart missing End / Resolution / Escalate step
DO $$
DECLARE
  v_scenario_id UUID;
  v_error_caught BOOLEAN := FALSE;
BEGIN
  SELECT id INTO v_scenario_id FROM pb_scenarios WHERE slug = 'wifi-vpn-connectivity-failure';

  BEGIN
    INSERT INTO pb_flowcharts (scenario_id, nodes, edges)
    VALUES (
      v_scenario_id,
      '[
        {"id": "n1", "data": {"nodeType": "start", "label": "Start"}},
        {"id": "n2", "data": {"nodeType": "action", "label": "Action Without End"}}
      ]'::jsonb,
      '[{"id": "e1", "source": "n1", "target": "n2"}]'::jsonb
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_error_caught := TRUE;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'Test 5 Failed: Flowchart without terminal step was unexpectedly allowed!';
  END IF;

  RAISE NOTICE 'Test 5 Passed: Missing terminal step correctly rejected.';
END $$;

-- Test 6: Validation rejects Decision step with missing branch (only Yes, missing No)
DO $$
DECLARE
  v_scenario_id UUID;
  v_error_caught BOOLEAN := FALSE;
BEGIN
  SELECT id INTO v_scenario_id FROM pb_scenarios WHERE slug = 'wifi-vpn-connectivity-failure';

  BEGIN
    INSERT INTO pb_flowcharts (scenario_id, nodes, edges)
    VALUES (
      v_scenario_id,
      '[
        {"id": "n1", "data": {"nodeType": "start", "label": "Start"}},
        {"id": "n2", "data": {"nodeType": "decision", "label": "Is VPN Connected?"}},
        {"id": "n3", "data": {"nodeType": "end", "label": "Done"}}
      ]'::jsonb,
      '[
        {"id": "e1", "source": "n1", "target": "n2"},
        {"id": "e2", "source": "n2", "target": "n3", "label": "Yes"}
      ]'::jsonb
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_error_caught := TRUE;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'Test 6 Failed: Decision missing No branch was unexpectedly allowed!';
  END IF;

  RAISE NOTICE 'Test 6 Passed: Incomplete decision branches correctly rejected.';
END $$;

-- Test 7: Validation rejects disconnected / orphan nodes
DO $$
DECLARE
  v_scenario_id UUID;
  v_error_caught BOOLEAN := FALSE;
BEGIN
  SELECT id INTO v_scenario_id FROM pb_scenarios WHERE slug = 'wifi-vpn-connectivity-failure';

  BEGIN
    INSERT INTO pb_flowcharts (scenario_id, nodes, edges)
    VALUES (
      v_scenario_id,
      '[
        {"id": "n1", "data": {"nodeType": "start", "label": "Start"}},
        {"id": "n2", "data": {"nodeType": "end", "label": "End"}},
        {"id": "n3", "data": {"nodeType": "action", "label": "Isolated Node"}}
      ]'::jsonb,
      '[{"id": "e1", "source": "n1", "target": "n2"}]'::jsonb
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_error_caught := TRUE;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'Test 7 Failed: Disconnected orphan node was unexpectedly allowed!';
  END IF;

  RAISE NOTICE 'Test 7 Passed: Disconnected orphan nodes correctly rejected.';
END $$;

ROLLBACK;

SELECT 'SECTION 11 FLOWCHART ACCEPTANCE SUITE PASSED SUCCESSFULLY' AS status;
