-- ============================================================================
-- BOS Playbook - Migration 17: Section 10 Scenario Editor & Publishing Enhancements
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enhance enforce_required_criteria() trigger function
--    Blocks transitions to status = 'published' if:
--      - title is empty
--      - quick_fix is empty
--      - resolutions is empty / has no steps
--      - required criteria are not set
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_required_criteria()
RETURNS TRIGGER AS $$
DECLARE
  field_def RECORD;
  cond_met BOOLEAN;
  cond_check RECORD;
  has_value BOOLEAN;
  missing_items TEXT[] := '{}';
  res_json JSONB;
BEGIN
  -- Only enforce on transition to 'published'
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN

    -- 1. Validate Title
    IF NEW.title IS NULL OR trim(NEW.title) = '' THEN
      missing_items := array_append(missing_items, 'Title');
    END IF;

    -- 2. Validate Quick Fix
    IF NEW.quick_fix IS NULL OR trim(NEW.quick_fix) = '' THEN
      missing_items := array_append(missing_items, 'Quick Fix');
    END IF;

    -- 3. Validate Resolutions
    IF NEW.resolutions IS NULL OR trim(NEW.resolutions) = '' THEN
      missing_items := array_append(missing_items, 'Resolution steps');
    ELSE
      -- If JSON array, verify length > 0
      BEGIN
        res_json := NEW.resolutions::jsonb;
        IF jsonb_typeof(res_json) = 'array' AND jsonb_array_length(res_json) = 0 THEN
          missing_items := array_append(missing_items, 'Resolution steps');
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Plain text string is acceptable if non-empty
        NULL;
      END;
    END IF;

    -- 4. Check all active required criteria fields
    FOR field_def IN
      SELECT cf.id, cf.label, cf.key, cf.required_condition
      FROM pb_criteria_fields cf
      WHERE cf.is_active = TRUE
        AND cf.is_required = TRUE
        AND cf.applies_to IN ('scenarios', 'both')
    LOOP
      cond_met := TRUE;
      IF field_def.required_condition IS NOT NULL THEN
        cond_met := FALSE;
        FOR cond_check IN
          SELECT j.value AS cond
          FROM jsonb_array_elements(field_def.required_condition->'if') AS j
        LOOP
          IF cond_check.cond->>'field_key' = 'category' THEN
            IF NEW.category_id IN (
              SELECT id FROM pb_categories WHERE slug = cond_check.cond->>'value' OR name = cond_check.cond->>'value'
            ) THEN
              cond_met := TRUE;
            END IF;
          ELSIF cond_check.cond->>'field_key' = 'account' THEN
            IF NEW.account_id IN (
              SELECT id FROM pb_accounts WHERE code = cond_check.cond->>'value' OR name = cond_check.cond->>'value'
            ) THEN
              cond_met := TRUE;
            END IF;
          ELSIF cond_check.cond->>'field_key' = 'issue_type' THEN
            IF NEW.issue_type_id IN (
              SELECT id FROM pb_criteria_options WHERE value = cond_check.cond->>'value'
            ) THEN
              cond_met := TRUE;
            END IF;
          ELSIF cond_check.cond->>'field_key' = 'severity' THEN
            IF NEW.severity_id IN (
              SELECT id FROM pb_criteria_options WHERE value = cond_check.cond->>'value'
            ) THEN
              cond_met := TRUE;
            END IF;
          ELSIF cond_check.cond->>'field_key' = 'impact_scope' THEN
            IF NEW.impact_scope_id IN (
              SELECT id FROM pb_criteria_options WHERE value = cond_check.cond->>'value'
            ) THEN
              cond_met := TRUE;
            END IF;
          END IF;
        END LOOP;
      END IF;

      IF cond_met THEN
        IF field_def.key = 'account' THEN
          has_value := NEW.account_id IS NOT NULL OR NEW.is_global = TRUE;
        ELSIF field_def.key = 'category' THEN
          has_value := NEW.category_id IS NOT NULL;
        ELSIF field_def.key = 'issue_type' THEN
          has_value := NEW.issue_type_id IS NOT NULL;
        ELSIF field_def.key = 'severity' THEN
          has_value := NEW.severity_id IS NOT NULL;
        ELSIF field_def.key = 'impact_scope' THEN
          has_value := NEW.impact_scope_id IS NOT NULL;
        ELSE
          has_value := EXISTS (
            SELECT 1 FROM pb_scenario_criteria_values v
            WHERE v.scenario_id = NEW.id AND v.field_id = field_def.id
          );
        END IF;

        IF NOT has_value THEN
          missing_items := array_append(missing_items, field_def.label);
        END IF;
      END IF;
    END LOOP;

    -- Raise exception if required items or criteria are missing
    IF array_length(missing_items, 1) > 0 THEN
      RAISE EXCEPTION 'Cannot publish: missing required items: %',
        array_to_string(missing_items, ', ')
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. Seed standard scenario templates (Internet Down, Teams Audio/Video, VPN, Login Failure)
-- ----------------------------------------------------------------------------
INSERT INTO pb_templates (name, key, description, criteria_defaults, sections_content, is_global, is_active)
VALUES
(
  'Internet Down',
  'template-internet-down',
  'Template for WAN link drops, fiber cuts, and router gateway ISP failover scenarios.',
  '{"issue_type": "frequent", "severity": "critical", "impact_scope": "site"}'::jsonb,
  '{
    "quick_fix": "<p>Switch the edge gateway router to the secondary failover ISP line (WAN Port 2). Power cycle the primary fiber ONT if unresponsive for >2 minutes.</p>",
    "symptoms": "<p>All workstations and IP phones lose public internet connectivity simultaneously. DNS lookups fail across all subnets.</p>",
    "causes": "[{\"title\": \"Fiber line cut or upstream ISP outage\", \"probability\": \"High\"}, {\"title\": \"Fiber ONT lockup\", \"probability\": \"Medium\"}]",
    "workarounds": "[{\"title\": \"Engage Cellular LTE Backup AP\", \"details\": \"Enable the 5G cellular failover hotspot in Comms Rack.\"}]",
    "resolutions": "[{\"step\": 1, \"instruction\": \"Verify WAN link status on edge gateway console.\", \"command\": \"ping -c 4 8.8.8.8\"}, {\"step\": 2, \"instruction\": \"Switch traffic policy to WAN2 Failover line.\", \"command\": \"sudo ip route replace default via 192.168.100.1 dev eth1\"}]",
    "escalation": "{\"level_1\": \"IT Support verifies physical rack LEDs.\", \"level_2\": \"Senior Network Engineer calls ISP NOC Hotline.\", \"sla_minutes\": 15}",
    "prevention": "<p>Ensure automated ping-based dual-WAN failover health check is active at all times.</p>"
  }'::jsonb,
  TRUE,
  TRUE
),
(
  'Teams Audio/Video',
  'template-teams-audio-video',
  'Template for robotic audio, video stuttering, and high CPU usage in Microsoft Teams.',
  '{"issue_type": "anticipated", "severity": "medium", "impact_scope": "team"}'::jsonb,
  '{
    "quick_fix": "<p>Disable GPU hardware acceleration in Teams settings and clear the local Teams app cache directory.</p>",
    "symptoms": "<p>Audio robotic/stuttering and video frames freezing during live customer tutoring sessions.</p>",
    "causes": "[{\"title\": \"Corrupt Teams Electron / WebView2 media cache\", \"probability\": \"High\"}, {\"title\": \"Integrated GPU hardware decoding conflict\", \"probability\": \"Medium\"}]",
    "workarounds": "[{\"title\": \"Switch to Teams Web in Chrome\", \"details\": \"Open teams.microsoft.com in Google Chrome with hardware acceleration disabled.\"}]",
    "resolutions": "[{\"step\": 1, \"instruction\": \"Quit Microsoft Teams completely from system tray.\", \"command\": \"taskkill /F /IM ms-teams.exe\"}, {\"step\": 2, \"instruction\": \"Purge local Teams cache folder.\", \"command\": \"Remove-Item -Recurse -Force $env:LOCALAPPDATA\\\\Packages\\\\MSTeams_8wekyb3d8bbwe\\\\LocalCache\"}]",
    "escalation": "{\"level_1\": \"IT Support conducts audio loopback test.\", \"level_2\": \"Escalate to Endpoint Management team for driver updates.\", \"sla_minutes\": 60}",
    "prevention": "<p>Deploy Teams performance optimization script during endpoint maintenance windows.</p>"
  }'::jsonb,
  TRUE,
  TRUE
),
(
  'VPN',
  'template-vpn',
  'Template for remote client VPN connectivity failures, TLS handshake timeouts, and port blockage.',
  '{"issue_type": "frequent", "severity": "high", "impact_scope": "single_user"}'::jsonb,
  '{
    "quick_fix": "<p>Flush DNS cache, toggle Wi-Fi adapter OFF and ON, and reconnect using the OpenVPN TCP profile (Port 443).</p>",
    "symptoms": "<p>Remote agent cannot connect to client portals. VPN client hangs on Connecting (TLS Handshake).</p>",
    "causes": "[{\"title\": \"Stale DHCP lease / DNS cache corruption\", \"probability\": \"High\"}, {\"title\": \"ISP UDP throttling\", \"probability\": \"Medium\"}]",
    "workarounds": "[{\"title\": \"Mobile Hotspot tethering\", \"details\": \"Tether to 5G mobile hotspot to bypass residential ISP throttling.\"}]",
    "resolutions": "[{\"step\": 1, \"instruction\": \"Flush DNS and reset Winsock stack.\", \"command\": \"ipconfig /flushdns && netsh winsock reset\"}, {\"step\": 2, \"instruction\": \"Switch VPN client protocol from UDP to TCP Port 443.\", \"command\": null}]",
    "escalation": "{\"level_1\": \"IT Support confirms agent credentials and MFA token.\", \"level_2\": \"Escalate to Systems Administrator for RADIUS logs.\", \"sla_minutes\": 30}",
    "prevention": "<p>Ensure all remote laptops have auto-updating VPN clients and preconfigured TCP fallback profiles.</p>"
  }'::jsonb,
  TRUE,
  TRUE
),
(
  'Login Failure',
  'template-login-failure',
  'Template for account lockouts, SSO authentication loops, and expired credentials.',
  '{"issue_type": "frequent", "severity": "medium", "impact_scope": "single_user"}'::jsonb,
  '{
    "quick_fix": "<p>Verify user active status in identity directory, clear browser cookies/sessions, and trigger self-service MFA reset.</p>",
    "symptoms": "<p>User receives Invalid username or password or gets redirected back to login page in an infinite loop.</p>",
    "causes": "[{\"title\": \"Account locked out due to expired cached password\", \"probability\": \"High\"}, {\"title\": \"MFA device clock out of sync\", \"probability\": \"Medium\"}]",
    "workarounds": "[{\"title\": \"Incognito / Private Window\", \"details\": \"Test login in an incognito window to bypass stale session cookies.\"}]",
    "resolutions": "[{\"step\": 1, \"instruction\": \"Check Active Directory / IAM for failed login attempts and unlock account.\", \"command\": null}, {\"step\": 2, \"instruction\": \"Resync user MFA token or generate temporary bypass code.\", \"command\": null}]",
    "escalation": "{\"level_1\": \"IT Support verifies identity and resets password.\", \"level_2\": \"Escalate to Security Operations if brute-force lockout detected.\", \"sla_minutes\": 15}",
    "prevention": "<p>Enforce password expiration notifications 7 days prior to expiry.</p>"
  }'::jsonb,
  TRUE,
  TRUE
)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    criteria_defaults = EXCLUDED.criteria_defaults,
    sections_content = EXCLUDED.sections_content,
    is_active = TRUE;

-- ----------------------------------------------------------------------------
-- 3. Duplicate and Archive scenario helper functions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION duplicate_scenario(p_scenario_id UUID)
RETURNS UUID AS $$
DECLARE
  v_source RECORD;
  v_new_id UUID;
  v_new_slug TEXT;
BEGIN
  SELECT * INTO v_source FROM pb_scenarios WHERE id = p_scenario_id AND deleted_at IS NULL;
  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Scenario not found';
  END IF;

  v_new_slug := v_source.slug || '-copy-' || lower(substr(md5(random()::text), 1, 6));

  INSERT INTO pb_scenarios (
    title,
    slug,
    summary,
    status,
    is_global,
    account_id,
    category_id,
    issue_type_id,
    severity_id,
    impact_scope_id,
    quick_fix,
    symptoms,
    causes,
    workarounds,
    resolutions,
    escalation,
    prevention,
    custom_sections,
    tags,
    created_by,
    updated_by
  ) VALUES (
    v_source.title || ' (Copy)',
    v_new_slug,
    v_source.summary,
    'draft', -- Always clones as draft
    v_source.is_global,
    v_source.account_id,
    v_source.category_id,
    v_source.issue_type_id,
    v_source.severity_id,
    v_source.impact_scope_id,
    v_source.quick_fix,
    v_source.symptoms,
    v_source.causes,
    v_source.workarounds,
    v_source.resolutions,
    v_source.escalation,
    v_source.prevention,
    v_source.custom_sections,
    v_source.tags,
    auth.uid(),
    auth.uid()
  ) RETURNING id INTO v_new_id;

  -- Clone flowchart if exists
  INSERT INTO pb_flowcharts (scenario_id, nodes, edges, viewport)
  SELECT v_new_id, nodes, edges, viewport
  FROM pb_flowcharts
  WHERE scenario_id = p_scenario_id
  ON CONFLICT DO NOTHING;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION archive_scenario(p_scenario_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE pb_scenarios
  SET status = 'archived',
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = p_scenario_id AND deleted_at IS NULL;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
