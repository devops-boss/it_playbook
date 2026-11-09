-- ============================================================================
-- BOS Playbook - Migration 16: Section 9 Scenario Enhancements & Sample Data
-- ============================================================================

-- 1. Ensure 'prevention' section definition exists in pb_section_definitions
INSERT INTO pb_section_definitions (name, key, label, sort_order, is_required, help_text)
VALUES ('prevention', 'prevention', 'Prevention Notes', 10, FALSE, 'Proactive steps and best practices to prevent recurrence')
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order;

-- Update subsequent section orders
UPDATE pb_section_definitions SET sort_order = 11 WHERE key = 'attachments';
UPDATE pb_section_definitions SET sort_order = 12 WHERE key = 'related';

-- 2. Clean up any existing sample scenarios to ensure idempotent migration
DELETE FROM pb_scenarios
WHERE slug IN ('internet-down-isp-failover', 'wifi-vpn-connectivity-failure', 'ms-teams-audio-video-lag')
   OR 'sample' = ANY(tags);

-- 3. Insert 3 Sample Scenarios tagged with 'sample'
DO $$
DECLARE
  v_admin_id UUID;
  v_hc_id UUID;
  v_mvrh_id UUID;
  v_il_id UUID;
  v_cat_internet UUID;
  v_cat_wifi UUID;
  v_cat_teams UUID;
  v_sev_critical UUID;
  v_sev_high UUID;
  v_sev_medium UUID;
  v_type_frequent UUID;
  v_type_anticipated UUID;
  v_impact_site UUID;
  v_impact_single UUID;
  v_impact_team UUID;
  v_outcome_resolved UUID;
  v_outcome_workaround UUID;

  v_scen_1 UUID;
  v_scen_2 UUID;
  v_scen_3 UUID;
BEGIN
  -- Resolve Admin User (Reinier Vista)
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'paulreinier.vista@bigoutsource.com';
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM auth.users LIMIT 1;
  END IF;

  -- Resolve Accounts
  SELECT id INTO v_hc_id FROM pb_accounts WHERE code = 'HC';
  SELECT id INTO v_mvrh_id FROM pb_accounts WHERE code = 'MVRH';
  SELECT id INTO v_il_id FROM pb_accounts WHERE code = 'IL';

  -- Resolve Categories
  SELECT id INTO v_cat_internet FROM pb_categories WHERE slug = 'internet-down';
  SELECT id INTO v_cat_wifi FROM pb_categories WHERE slug = 'wi-fi';
  SELECT id INTO v_cat_teams FROM pb_categories WHERE slug = 'ms-teams';

  -- Resolve Criteria Options
  SELECT co.id INTO v_sev_critical FROM pb_criteria_options co JOIN pb_criteria_fields cf ON co.field_id = cf.id WHERE cf.key = 'severity' AND co.label = 'Critical';
  SELECT co.id INTO v_sev_high FROM pb_criteria_options co JOIN pb_criteria_fields cf ON co.field_id = cf.id WHERE cf.key = 'severity' AND co.label = 'High';
  SELECT co.id INTO v_sev_medium FROM pb_criteria_options co JOIN pb_criteria_fields cf ON co.field_id = cf.id WHERE cf.key = 'severity' AND co.label = 'Medium';

  SELECT co.id INTO v_type_frequent FROM pb_criteria_options co JOIN pb_criteria_fields cf ON co.field_id = cf.id WHERE cf.key = 'issue_type' AND co.label = 'Frequent/Known';
  SELECT co.id INTO v_type_anticipated FROM pb_criteria_options co JOIN pb_criteria_fields cf ON co.field_id = cf.id WHERE cf.key = 'issue_type' AND co.label = 'Anticipated/Potential';

  SELECT co.id INTO v_impact_site FROM pb_criteria_options co JOIN pb_criteria_fields cf ON co.field_id = cf.id WHERE cf.key = 'impact_scope' AND co.label = 'Site';
  SELECT co.id INTO v_impact_single FROM pb_criteria_options co JOIN pb_criteria_fields cf ON co.field_id = cf.id WHERE cf.key = 'impact_scope' AND co.label = 'Single user';
  SELECT co.id INTO v_impact_team FROM pb_criteria_options co JOIN pb_criteria_fields cf ON co.field_id = cf.id WHERE cf.key = 'impact_scope' AND co.label = 'Team';

  -- Resolve Outcomes
  SELECT id INTO v_outcome_resolved FROM pb_outcomes WHERE value = 'resolved';
  SELECT id INTO v_outcome_workaround FROM pb_outcomes WHERE value = 'workaround';

  -- --------------------------------------------------------------------------
  -- Scenario 1: Internet Down - ISP Failover Procedure (Health Carousel)
  -- --------------------------------------------------------------------------
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
    tags,
    created_by,
    updated_by,
    published_at
  ) VALUES (
    'Internet Down - ISP Failover Procedure',
    'internet-down-isp-failover',
    'Complete loss of primary fiber uplink. Instructions for verifying WAN edge state and manually engaging backup ISP failover line.',
    'published',
    FALSE,
    v_hc_id,
    v_cat_internet,
    v_type_frequent,
    v_sev_critical,
    v_impact_site,
    '<p>Switch edge router traffic to <strong>secondary failover ISP line (WAN Port 2)</strong>. Power-cycle the primary fiber ONT if unresponsive for &gt;2 minutes.</p>',
    '<p>All workstations and IP phones lose public internet connectivity simultaneously. DNS lookups fail across all subnets with <code>ERR_NAME_NOT_RESOLVED</code>. The primary ISP fiber gateway displays a steady amber or flashing red LOS (Loss of Signal) alarm LED.</p>',
    '[{"title": "Fiber line cut or upstream ISP provider outage", "probability": "High"}, {"title": "ONT / Fiber modem hardware lockup", "probability": "Medium"}, {"title": "Core gateway routing table loop", "probability": "Low"}]',
    '[{"title": "Activate LTE Emergency Backup AP", "details": "Power on the cellular 5G gateway located in Comms Rack 2 to route mission-critical HESK ticketing traffic."}]',
    '[{"step": 1, "instruction": "Verify WAN link status on the edge gateway (UniFi/Cisco console at 192.168.1.1).", "command": "ping -c 4 8.8.8.8"}, {"step": 2, "instruction": "If WAN1 is DOWN, flip traffic policy to WAN2 Failover line.", "command": "sudo ip route replace default via 192.168.100.1 dev eth1"}, {"step": 3, "instruction": "Reboot primary fiber ONT by disconnecting AC power for 30 seconds.", "command": null}, {"step": 4, "instruction": "Verify packet flow and public DNS resolution on local endpoints.", "command": "nslookup google.com 1.1.1.1"}]',
    '{"level_1": "IT Support on-duty checks physical rack LEDs and notifies Shift Lead.", "level_2": "Senior Network Engineer calls ISP NOC Hotline (1-800-555-FIBER) with Circuit ID #HC-PH-0928.", "sla_minutes": 15}',
    '<p>Ensure dual-WAN automated failover health check (ping interval 5s) is active on the primary router at all times. Test failover lines monthly.</p>',
    ARRAY['sample', 'network', 'outage', 'isp', 'failover'],
    v_admin_id,
    v_admin_id,
    now()
  ) RETURNING id INTO v_scen_1;

  -- 2 Sample Tickets for Scenario 1 (HESK tracking IDs only)
  INSERT INTO pb_sample_tickets (
    scenario_id,
    ticket_id,
    ticket_date,
    outcome_id,
    resolution_notes
  ) VALUES
  (
    v_scen_1,
    'BOS-49281',
    '2026-10-15',
    v_outcome_resolved,
    'Primary fiber restored after ISP resolved local exchange splice issue.'
  ),
  (
    v_scen_1,
    'BOS-51029',
    '2026-10-24',
    v_outcome_workaround,
    'Routed traffic through secondary WAN line B during scheduled telco pole relocation.'
  );

  -- --------------------------------------------------------------------------
  -- Scenario 2: Wi-Fi & Corporate VPN Connectivity Failure (MyVRhost)
  -- --------------------------------------------------------------------------
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
    tags,
    created_by,
    updated_by,
    published_at
  ) VALUES (
    'Wi-Fi & Corporate VPN Connectivity Failure',
    'wifi-vpn-connectivity-failure',
    'Remote agent unable to access internal property management systems due to Wi-Fi lease failure or VPN handshake blockage.',
    'published',
    FALSE,
    v_mvrh_id,
    v_cat_wifi,
    v_type_frequent,
    v_sev_high,
    v_impact_single,
    '<p>Flush DNS cache, toggle Wi-Fi adapter OFF and ON, and reconnect using the <strong>OpenVPN TCP profile (Port 443)</strong>.</p>',
    '<p>Remote agent cannot connect to client internal portals. Wi-Fi connects but states &quot;No Internet, secured&quot;, or the VPN client gets stuck in &quot;Connecting (TLS Handshake)&quot; state indefinitely.</p>',
    '[{"title": "Stale DHCP lease / DNS cache corruption", "probability": "High"}, {"title": "ISP UDP port throttling blocking WireGuard/OpenVPN UDP", "probability": "Medium"}, {"title": "Expired machine certificate or SSO session token", "probability": "Low"}]',
    '[{"title": "Mobile Hotspot Tethering", "details": "Connect workstation to 5G mobile hotspot to bypass local residential ISP throttling."}]',
    '[{"step": 1, "instruction": "Open PowerShell as Administrator and flush the local DNS resolver cache.", "command": "ipconfig /flushdns && netsh winsock reset"}, {"step": 2, "instruction": "Switch the VPN client protocol from UDP to TCP Port 443 in client settings.", "command": null}, {"step": 3, "instruction": "Restart the workstation network adapter.", "command": "Restart-NetAdapter -Name ''Wi-Fi''"}, {"step": 4, "instruction": "Initiate connection to the primary corporate VPN gateway.", "command": "vpncli connect vpn.myvrhost.bos"}]',
    '{"level_1": "IT Support confirms agent credentials and MFA token validity.", "level_2": "Escalate to Systems Administrator for RADIUS/VPN server auth log review.", "sla_minutes": 30}',
    '<p>Ensure all remote workstations have auto-updating VPN clients and preconfigured TCP fallback profiles installed.</p>',
    ARRAY['sample', 'wifi', 'vpn', 'remote', 'network'],
    v_admin_id,
    v_admin_id,
    now()
  ) RETURNING id INTO v_scen_2;

  -- 2 Sample Tickets for Scenario 2 (HESK tracking IDs only)
  INSERT INTO pb_sample_tickets (
    scenario_id,
    ticket_id,
    ticket_date,
    outcome_id,
    resolution_notes
  ) VALUES
  (
    v_scen_2,
    'BOS-33104',
    '2026-10-18',
    v_outcome_resolved,
    'Agent switched to TCP 443 profile; connection established immediately.'
  ),
  (
    v_scen_2,
    'BOS-33892',
    '2026-10-26',
    v_outcome_resolved,
    'Adapter reset and Winsock flush resolved no-internet status.'
  );

  -- --------------------------------------------------------------------------
  -- Scenario 3: Microsoft Teams Audio and Video Lag (Imagine Learning)
  -- --------------------------------------------------------------------------
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
    tags,
    created_by,
    updated_by,
    published_at
  ) VALUES (
    'Microsoft Teams Audio and Video Lag',
    'ms-teams-audio-video-lag',
    'Robotic audio distortion and video stuttering during live student coaching sessions on Imagine Learning workstations.',
    'published',
    FALSE,
    v_il_id,
    v_cat_teams,
    v_type_anticipated,
    v_sev_medium,
    v_impact_team,
    '<p>Disable GPU hardware acceleration in Teams settings and clear the local Teams app cache directory.</p>',
    '<p>Audio robotic/stuttering and video frames freezing during live customer tutoring sessions. High CPU utilization (&gt;90%) indicated by <code>ms-teams.exe</code> in Task Manager.</p>',
    '[{"title": "Corrupt Teams Electron / WebView2 media cache", "probability": "High"}, {"title": "Integrated GPU hardware decoding conflict", "probability": "Medium"}, {"title": "Background audio processing / third-party noise filter clash", "probability": "Low"}]',
    '[{"title": "Switch to Teams Web in Chrome", "details": "Instruct tutor to open teams.microsoft.com in Google Chrome with hardware acceleration disabled."}]',
    '[{"step": 1, "instruction": "Completely quit Microsoft Teams from the Windows system tray.", "command": "taskkill /F /IM ms-teams.exe"}, {"step": 2, "instruction": "Clear the local Teams cache folder.", "command": "Remove-Item -Recurse -Force \"$env:LOCALAPPDATA\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache\""}, {"step": 3, "instruction": "Relaunch Teams and toggle off GPU hardware acceleration in Settings > General.", "command": null}, {"step": 4, "instruction": "Conduct a test call via Teams Settings > Devices > Make a test call.", "command": null}]',
    '{"level_1": "IT Support conducts device audio loopback test.", "level_2": "Escalate to Endpoint Management team for driver updates.", "sla_minutes": 60}',
    '<p>Deploy Teams performance optimization script during weekly endpoint maintenance windows.</p>',
    ARRAY['sample', 'teams', 'audio', 'video', 'hardware-accel', 'cache'],
    v_admin_id,
    v_admin_id,
    now()
  ) RETURNING id INTO v_scen_3;

  -- 2 Sample Tickets for Scenario 3 (HESK tracking IDs only)
  INSERT INTO pb_sample_tickets (
    scenario_id,
    ticket_id,
    ticket_date,
    outcome_id,
    resolution_notes
  ) VALUES
  (
    v_scen_3,
    'BOS-28410',
    '2026-10-12',
    v_outcome_resolved,
    'Local cache cleared; CPU dropped from 94% to 18% during active call.'
  ),
  (
    v_scen_3,
    'BOS-29004',
    '2026-10-22',
    v_outcome_workaround,
    'Agent utilized Teams Web client while full app cache was purged.'
  );

  -- 4. Cross-link Scenario 1 and Scenario 2 in pb_related_scenarios
  INSERT INTO pb_related_scenarios (scenario_id, related_scenario_id, relation_type)
  VALUES
    (v_scen_1, v_scen_2, 'related'),
    (v_scen_2, v_scen_1, 'related')
  ON CONFLICT DO NOTHING;

END $$;
