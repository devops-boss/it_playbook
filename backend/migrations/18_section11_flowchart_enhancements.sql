-- ============================================================================
-- Section 11: Flowchart Enhancements & Database Validation
-- Big Outsource IT Operations Playbook
-- ============================================================================

-- 1. Ensure node types use Big Outsource brand palette and standard icons
INSERT INTO pb_node_types (key, label, icon, color, sort_order, is_active)
VALUES
  ('start', 'Start', 'player-play', '#10b981', 1, TRUE),
  ('action', 'Action', 'settings', '#233B74', 2, TRUE),
  ('decision', 'Decision', 'help-circle', '#E07E3C', 3, TRUE),
  ('workaround', 'Workaround', 'alert-triangle', '#288FC2', 4, TRUE),
  ('resolution', 'Resolution', 'check-circle', '#10b981', 5, TRUE),
  ('escalate', 'Escalate', 'arrow-up-right', '#dc2626', 6, TRUE),
  ('end', 'End', 'square', '#64748b', 7, TRUE)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE;

-- 2. Flowchart Validation Function
CREATE OR REPLACE FUNCTION validate_flowchart_json()
RETURNS TRIGGER AS $$
DECLARE
  v_node_count INT;
  v_start_count INT;
  v_end_count INT;
  v_node JSONB;
  v_node_id TEXT;
  v_node_label TEXT;
  v_node_type TEXT;
  v_has_yes BOOLEAN;
  v_has_no BOOLEAN;
  v_is_connected BOOLEAN;
BEGIN
  IF NEW.nodes IS NULL THEN
    NEW.nodes := '[]'::jsonb;
  END IF;
  IF NEW.edges IS NULL THEN
    NEW.edges := '[]'::jsonb;
  END IF;

  v_node_count := jsonb_array_length(NEW.nodes);

  -- Empty flowchart is allowed (cleared or not configured yet)
  IF v_node_count = 0 THEN
    RETURN NEW;
  END IF;

  -- 1. Exactly one Start step
  SELECT count(*) INTO v_start_count
  FROM jsonb_array_elements(NEW.nodes) n
  WHERE coalesce(n->'data'->>'nodeType', n->>'nodeType', n->>'type') = 'start';

  IF v_start_count = 0 THEN
    RAISE EXCEPTION 'Flowchart validation failed: Exactly one Start step is required.' USING ERRCODE = '23514';
  ELSIF v_start_count > 1 THEN
    RAISE EXCEPTION 'Flowchart validation failed: Multiple Start steps detected (%). Exactly one is allowed.', v_start_count USING ERRCODE = '23514';
  END IF;

  -- 2. At least one End, Resolution, or Escalate step
  SELECT count(*) INTO v_end_count
  FROM jsonb_array_elements(NEW.nodes) n
  WHERE coalesce(n->'data'->>'nodeType', n->>'nodeType', n->>'type') IN ('end', 'resolution', 'escalate');

  IF v_end_count = 0 THEN
    RAISE EXCEPTION 'Flowchart validation failed: At least one End, Resolution, or Escalate step is required.' USING ERRCODE = '23514';
  END IF;

  -- 3. Check Decision branches and disconnected nodes
  FOR v_node IN SELECT * FROM jsonb_array_elements(NEW.nodes)
  LOOP
    v_node_id := v_node->>'id';
    v_node_label := coalesce(v_node->'data'->>'label', v_node->>'label', v_node_id);
    v_node_type := coalesce(v_node->'data'->>'nodeType', v_node->>'nodeType', v_node->>'type');

    -- Decision nodes must have both Yes and No branches
    IF v_node_type = 'decision' THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(NEW.edges) e
        WHERE (e->>'source') = v_node_id
          AND (lower(coalesce(e->>'label', '')) = 'yes' OR lower(coalesce(e->'data'->>'branch', '')) = 'yes')
      ) INTO v_has_yes;

      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(NEW.edges) e
        WHERE (e->>'source') = v_node_id
          AND (lower(coalesce(e->>'label', '')) = 'no' OR lower(coalesce(e->'data'->>'branch', '')) = 'no')
      ) INTO v_has_no;

      IF NOT v_has_yes OR NOT v_has_no THEN
        RAISE EXCEPTION 'Flowchart validation failed: Decision step "%" must have both Yes and No branches connected.', v_node_label USING ERRCODE = '23514';
      END IF;
    END IF;

    -- All nodes in a multi-node flowchart must be connected
    IF v_node_count > 1 THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(NEW.edges) e
        WHERE (e->>'source') = v_node_id OR (e->>'target') = v_node_id
      ) INTO v_is_connected;

      IF NOT v_is_connected THEN
        RAISE EXCEPTION 'Flowchart validation failed: Step "%" is disconnected from the flowchart.', v_node_label USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach validation trigger to pb_flowcharts
DROP TRIGGER IF EXISTS trg_validate_flowchart ON pb_flowcharts;
CREATE TRIGGER trg_validate_flowchart
  BEFORE INSERT OR UPDATE ON pb_flowcharts
  FOR EACH ROW
  EXECUTE FUNCTION validate_flowchart_json();

-- 4. Seed 7-node troubleshooting flowchart for Internet Down scenario
DO $$
DECLARE
  v_scenario_id UUID;
  v_nodes JSONB;
  v_edges JSONB;
BEGIN
  SELECT id INTO v_scenario_id
  FROM pb_scenarios
  WHERE slug = 'internet-down-isp-failover'
  LIMIT 1;

  IF v_scenario_id IS NOT NULL THEN
    v_nodes := '[
      {
        "id": "n-start",
        "type": "flowNode",
        "position": {"x": 380, "y": 40},
        "data": {
          "label": "Internet Down Alert",
          "nodeType": "start",
          "description": "User or network monitoring detects primary fiber circuit loss.",
          "borderColor": "#10b981",
          "backgroundColor": "#10b9811a"
        }
      },
      {
        "id": "n-action-led",
        "type": "flowNode",
        "position": {"x": 380, "y": 150},
        "data": {
          "label": "Inspect Router WAN1 LED",
          "nodeType": "action",
          "description": "Check physical Edge Gateway WAN1 port LED indicator (Solid Green = Connected, Amber/Red/Off = Physical Link Down).",
          "borderColor": "#233B74",
          "backgroundColor": "#233B741a"
        }
      },
      {
        "id": "n-dec-led",
        "type": "flowNode",
        "position": {"x": 380, "y": 270},
        "data": {
          "label": "Is WAN1 LED Amber or Off?",
          "nodeType": "decision",
          "description": "Determine whether failure is physical fiber carrier cut or internal gateway/DNS routing issue.",
          "borderColor": "#E07E3C",
          "backgroundColor": "#E07E3C1a"
        }
      },
      {
        "id": "n-act-failover",
        "type": "flowNode",
        "position": {"x": 160, "y": 400},
        "data": {
          "label": "Activate WAN2 Backup / 4G Failover",
          "nodeType": "action",
          "description": "Switch default gateway routing to secondary ISP link (PLDT/Globe) or SD-WAN 4G LTE backup interface.",
          "borderColor": "#233B74",
          "backgroundColor": "#233B741a"
        }
      },
      {
        "id": "n-res-restored",
        "type": "flowNode",
        "position": {"x": 160, "y": 540},
        "data": {
          "label": "Internet Restored via Secondary ISP",
          "nodeType": "resolution",
          "description": "Confirm continuous ICMP replies from 8.8.8.8 and notify shift supervisor.",
          "borderColor": "#10b981",
          "backgroundColor": "#10b9811a"
        }
      },
      {
        "id": "n-wrk-ont",
        "type": "flowNode",
        "position": {"x": 600, "y": 400},
        "data": {
          "label": "Power Cycle Optical ONT & Flush Local DNS",
          "nodeType": "workaround",
          "description": "Reboot fiber ONT terminal for 60 seconds and run ipconfig /flushdns on the local gateway.",
          "borderColor": "#288FC2",
          "backgroundColor": "#288FC21a"
        }
      },
      {
        "id": "n-esc-isp",
        "type": "flowNode",
        "position": {"x": 600, "y": 540},
        "data": {
          "label": "Escalate to ISP NOC Hotline",
          "nodeType": "escalate",
          "description": "Call ISP hotline with Big Outsource Circuit Account ID and file HESK ticket.",
          "borderColor": "#dc2626",
          "backgroundColor": "#dc26261a"
        }
      }
    ]'::jsonb;

    v_edges := '[
      {
        "id": "e-start-led",
        "source": "n-start",
        "target": "n-action-led"
      },
      {
        "id": "e-led-dec",
        "source": "n-action-led",
        "target": "n-dec-led"
      },
      {
        "id": "e-dec-yes",
        "source": "n-dec-led",
        "target": "n-act-failover",
        "label": "Yes",
        "data": {"branch": "yes"}
      },
      {
        "id": "e-failover-res",
        "source": "n-act-failover",
        "target": "n-res-restored"
      },
      {
        "id": "e-dec-no",
        "source": "n-dec-led",
        "target": "n-wrk-ont",
        "label": "No",
        "data": {"branch": "no"}
      },
      {
        "id": "e-ont-esc",
        "source": "n-wrk-ont",
        "target": "n-esc-isp"
      }
    ]'::jsonb;

    INSERT INTO pb_flowcharts (scenario_id, nodes, edges, viewport, version)
    VALUES (v_scenario_id, v_nodes, v_edges, '{"x": 0, "y": 0, "zoom": 1}'::jsonb, 1)
    ON CONFLICT (scenario_id) DO UPDATE SET
      nodes = EXCLUDED.nodes,
      edges = EXCLUDED.edges,
      viewport = EXCLUDED.viewport,
      version = pb_flowcharts.version + 1,
      updated_at = now();
  END IF;
END $$;
