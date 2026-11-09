-- ============================================================================
-- BOS Playbook - Demo content
--
-- Three sample accounts, two example custom criteria fields, curated and
-- smart playbooks, and fifteen scenarios covering every combination:
-- one account only, the other account only, both accounts, and global.
--
-- Five scenarios carry a troubleshooting flowchart and eleven carry sample
-- tickets (Internet Down, Wi-Fi/VPN, Teams audio/video and Softphone included).
--
-- This file is idempotent: it can be run more than once safely.
--
-- ---------------------------------------------------------------------------
-- DEMO USERS
--
--   admin@bosp.local     Super Admin
--   editor@bosp.local    IT Ops Editor
--   reviewer@bosp.local  Reviewer
--   agent@bosp.local     IT Agent
--
-- All four share one password. scripts/seed.sh passes it in through the
-- bosp.demo_password session setting, so the shared password is never
-- hard-coded here. Running this file on its own falls back to a throwaway
-- value.
--
-- These accounts exist only to demonstrate the role model. Delete them
-- before the system goes live.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
INSERT INTO pb_accounts (name, code, description, accent_color, status, is_global, settings)
VALUES
  (
    'Northwind Logistics',
    'NWL',
    'Freight forwarding and warehousing. 400 agents across three sites, heavy VPN and VDI use.',
    '#2563eb',
    'Active',
    FALSE,
    '{"tabs":[{"key":"frequent","label":"Frequent problems"},{"key":"anticipated","label":"Anticipated"},{"key":"by_category","label":"By category"},{"key":"critical","label":"Critical issues"},{"key":"all","label":"All scenarios"}],"ticket_url_template":"https://tickets.nwl.internal/incident/{ticket_id}"}'::jsonb
  ),
  (
    'Crestline Health',
    'CRH',
    'Medical claims processing for a regional provider. Strictly on-site, dedicated softphone fleet.',
    '#0f9d58',
    'Active',
    FALSE,
    '{"tabs":[{"key":"frequent","label":"Frequent problems"},{"key":"anticipated","label":"Anticipated"},{"key":"by_category","label":"By category"},{"key":"critical","label":"Critical issues"},{"key":"all","label":"Everything"}],"ticket_url_template":"https://service.crestline.health/ticket/{ticket_id}"}'::jsonb
  ),
  (
    'Halcyon Retail',
    'HLC',
    'Retail support operations. Recently onboarded, mostly remote staff on Teams.',
    '#f59e0b',
    'Onboarding',
    FALSE,
    '{"tabs":[{"key":"frequent","label":"Frequent problems"},{"key":"by_category","label":"By category"},{"key":"all","label":"All scenarios"}]}'::jsonb
  )
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Two example custom criteria fields
--
-- These prove the point of the criteria system: a new dimension appears in
-- the search facets, the editor and the coverage matrix with no code change.
-- The system already ships a 'vendor' field; 'isp_vendor' deliberately
-- demonstrates adding a genuinely new one.
-- ---------------------------------------------------------------------------
INSERT INTO pb_criteria_fields (key, label, description, type, scope, applies_to, is_required, show_as_facet, show_on_card, sort_order, is_system, is_active)
VALUES
  ('isp_vendor', 'ISP / Vendor', 'The supplier responsible for the circuit or equipment.', 'single-select', 'global', 'both', FALSE, TRUE, TRUE, 11, FALSE, TRUE),
  ('shift', 'Shift', 'Which shift the issue was reported on.', 'single-select', 'global', 'both', FALSE, TRUE, FALSE, 12, FALSE, TRUE)
ON CONFLICT (key) DO NOTHING;

INSERT INTO pb_criteria_options (field_id, label, value, color, sort_order)
SELECT cf.id, o.label, o.value, o.color, o.sort_order
FROM (VALUES
  ('Meridian Telecom', 'meridian', '#0ea5e9', 1),
  ('Broadpath Fibre', 'broadpath', '#6366f1', 2),
  ('Vantage Broadband', 'vantage', '#8b5cf6', 3),
  ('In-house', 'in-house', '#64748b', 4),
  ('Telecom (voice)', 'telecom-voice', '#0f9d58', 5)
) AS o(label, value, color, sort_order)
CROSS JOIN pb_criteria_fields cf
WHERE cf.key = 'isp_vendor'
  AND NOT EXISTS (
    SELECT 1 FROM pb_criteria_options x
    WHERE x.field_id = cf.id AND x.value = o.value
  );

INSERT INTO pb_criteria_options (field_id, label, value, color, sort_order)
SELECT cf.id, o.label, o.value, o.color, o.sort_order
FROM (VALUES
  ('Early (06:00-14:00)', 'early', '#f59e0b', 1),
  ('Late (14:00-22:00)', 'late', '#6366f1', 2),
  ('Night (22:00-06:00)', 'night', '#3b82f6', 3),
  ('Weekend', 'weekend', '#64748b', 4)
) AS o(label, value, color, sort_order)
CROSS JOIN pb_criteria_fields cf
WHERE cf.key = 'shift'
  AND NOT EXISTS (
    SELECT 1 FROM pb_criteria_options x
    WHERE x.field_id = cf.id AND x.value = o.value
  );

-- ---------------------------------------------------------------------------
-- Extra categories for the global scenarios
-- ---------------------------------------------------------------------------
INSERT INTO pb_categories (name, slug, parent_id, icon, color, sort_order)
SELECT c.name, c.slug, NULL, c.icon, c.color, c.sort_order
FROM (VALUES
  ('Incident Process', 'incident-process', 'clipboard', '#6366f1', 90),
  ('Security', 'security', 'shield', '#ef4444', 91),
  ('ACS', 'acs', 'door', '#0284c7', 92)
) AS c(name, slug, icon, color, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM pb_categories x WHERE x.slug = c.slug);

-- ---------------------------------------------------------------------------
-- Demo users
--
-- One per role, all sharing the password 'Playbook2024!'. These accounts
-- exist only to demonstrate the role model - remove them before going live.
--
-- The rows go straight into auth.users. GoTrue does not require an
-- auth.identities row for a password sign-in, and the bcrypt hash written
-- here is in the same format GoTrue produces, so these users can sign in
-- through the normal login form. Doing it in SQL keeps the seed free of the
-- service-role key and makes it work identically against the plain-Postgres
-- test harness, whose auth.users is a reduced stub.
--
-- The column set differs between GoTrue and the stub, so the insert is
-- assembled from the columns that are actually present.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_demo CONSTANT jsonb := jsonb_build_object(
    'admin@bosp.local',    jsonb_build_object('name', 'Alex Admin',     'role', 'Super Admin'),
    'editor@bosp.local',   jsonb_build_object('name', 'Erin Editor',    'role', 'IT Ops Editor'),
    'reviewer@bosp.local', jsonb_build_object('name', 'Robin Reviewer', 'role', 'Reviewer'),
    'agent@bosp.local',    jsonb_build_object('name', 'Ash Agent',      'role', 'IT Agent')
  );
  v_email TEXT;
  v_spec JSONB;
  v_display TEXT;
  v_role TEXT;
  v_id UUID;
  v_cols TEXT;
  v_vals TEXT;
  v_password TEXT;
  v_conflict TEXT;
  v_token TEXT;
  v_set TEXT;
BEGIN
  -- The shared demo password comes from the caller so it never has to live in
  -- this file. A throwaway value keeps the migration runnable on its own.
  v_password := coalesce(
    nullif(current_setting('bosp.demo_password', TRUE), ''),
    'demo-' || substr(md5(random()::text), 1, 12)
  );

  FOR v_email, v_spec IN SELECT key, value FROM jsonb_each(v_demo) LOOP
    v_display := v_spec->>'name';
    v_role := v_spec->>'role';

    v_cols := 'email, encrypted_password';
    v_vals := quote_literal(v_email)
              || ', ' || quote_literal(crypt(v_password, gen_salt('bf')));
    v_set := '';

    -- The GoTrue schema has columns the test stub does not, and several of
    -- them have no default, so a value has to be given for them. Each one
    -- is added only when the column is there and has no default of its
    -- own - otherwise the insert would fail on the NOT NULL constraint.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'id' AND column_default IS NULL
    ) THEN
      v_cols := v_cols || ', id';
      v_vals := v_vals || ', gen_random_uuid()';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'instance_id' AND column_default IS NULL
    ) THEN
      v_cols := v_cols || ', instance_id';
      v_vals := v_vals || ', ' || quote_literal('00000000-0000-0000-0000-000000000000');
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'aud' AND column_default IS NULL
    ) THEN
      v_cols := v_cols || ', aud';
      v_vals := v_vals || ', ' || quote_literal('authenticated');
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'role' AND column_default IS NULL
    ) THEN
      v_cols := v_cols || ', role';
      v_vals := v_vals || ', ' || quote_literal('authenticated');
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'created_at' AND column_default IS NULL
    ) THEN
      v_cols := v_cols || ', created_at';
      v_vals := v_vals || ', now()';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'updated_at' AND column_default IS NULL
    ) THEN
      v_cols := v_cols || ', updated_at';
      v_vals := v_vals || ', now()';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'email_confirmed_at'
    ) THEN
      v_cols := v_cols || ', email_confirmed_at';
      v_vals := v_vals || ', now()';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'raw_app_meta_data'
    ) THEN
      v_cols := v_cols || ', raw_app_meta_data';
      v_vals := v_vals || ', '
                || quote_literal('{"provider":"email","providers":["email"]}'::jsonb);
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'raw_user_meta_data'
    ) THEN
      v_cols := v_cols || ', raw_user_meta_data';
      v_vals := v_vals || ', '
                || quote_literal(jsonb_build_object('display_name', v_display)::text);
    END IF;

    -- GoTrue reads these token columns into plain Go strings. A NULL in any
    -- of them makes a sign-in fail with a scan error ("converting NULL to
    -- string is unsupported"). The application creates users through the
    -- GoTrue admin API, which writes empty strings; the seed writes rows
    -- directly, so it has to do the same.
    FOREACH v_token IN ARRAY ARRAY[
      'confirmation_token', 'email_change_token_new', 'email_change_token_current',
      'recovery_token', 'email_change', 'phone_change_token',
      'reauthentication_token', 'invite_token'
    ] LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'users'
          AND column_name = v_token AND column_default IS NULL
      ) THEN
        v_cols := v_cols || ', ' || v_token;
        v_vals := v_vals || ', ' || quote_literal('');
        IF v_set <> '' THEN
          v_set := v_set || ', ';
        END IF;
        v_set := v_set || v_token || ' = coalesce(' || v_token || ', '''')';
      END IF;
    END LOOP;

    -- The conflict target depends on the schema of auth.users.
    --
    -- In the real GoTrue schema the unique index on the email address is
    -- PARTIAL: it only covers the rows that are not single sign-on users
    -- ("WHERE is_sso_user = false"). A conflict target that does not name
    -- the same predicate does not match that index, and Postgres refuses
    -- the statement with "there is no unique or exclusion constraint
    -- matching the ON CONFLICT specification".
    --
    -- The test harness uses a plain unique constraint instead, where the
    -- bare column name is right. Both are handled here so the same seed
    -- file works against both.
    v_conflict := '(email)';
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'is_sso_user'
    ) AND EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'auth' AND tablename = 'users'
        AND indexdef ILIKE '%unique index%'
        AND indexdef LIKE '%(email)%'
        AND indexdef ILIKE '%where%'
    ) THEN
      v_conflict := '(email) WHERE (is_sso_user = false)';
    END IF;

    EXECUTE format(
      'INSERT INTO auth.users (%s) VALUES (%s) ON CONFLICT %s DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password',
      v_cols, v_vals, v_conflict
    );

    SELECT id INTO v_id FROM auth.users WHERE email = v_email;

    -- Rows that already existed keep whatever the previous run left in
    -- them, so the empty token values are set again here.
    IF v_set <> '' THEN
      EXECUTE format(
        'UPDATE auth.users SET %s WHERE email = %s',
        v_set, quote_literal(v_email)
      );
    END IF;

    INSERT INTO pb_user_profiles (id, display_name, is_active)
    VALUES (v_id, v_display, TRUE)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

    INSERT INTO pb_user_roles (user_id, role_id)
    SELECT v_id, r.id FROM pb_roles r WHERE r.name = v_role
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- The agent only sees Northwind. The editor and the reviewer can see
-- everything, so they are granted every account.
INSERT INTO pb_user_accounts (user_id, account_id)
SELECT u.id, a.id
FROM (VALUES
  ('agent@bosp.local', 'NWL'),
  ('editor@bosp.local', 'NWL'),
  ('editor@bosp.local', 'CRH'),
  ('editor@bosp.local', 'HLC'),
  ('reviewer@bosp.local', 'NWL'),
  ('reviewer@bosp.local', 'CRH'),
  ('reviewer@bosp.local', 'HLC')
) AS v(email, account_code)
JOIN auth.users u ON u.email = v.email
JOIN pb_accounts a ON a.code = v.account_code
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Scenarios
--
-- The mix deliberately covers:
--   * Northwind only, Crestline only, both accounts, and global
--   * Frequent, Anticipated and One-off issue types
--   * Critical, High, Medium and Low severities
--   * Single user, Team, Site, Account-wide and Company-wide impact scopes
--
-- Content is written as HTML, which is what the rich text editor stores.
-- ---------------------------------------------------------------------------
INSERT INTO pb_scenarios (
  title, slug, summary, status, is_global, account_id, category_id,
  issue_type_id, severity_id, impact_scope_id,
  quick_fix, symptoms, causes, workarounds, resolutions, escalation,
  prevention, tags, created_by
)
SELECT
  s.title, s.slug, s.summary, 'published', s.is_global, a.id, c.id,
  ot.id, sev.id, isc.id,
  s.quick_fix, s.symptoms, s.causes, s.workarounds, s.resolutions, s.escalation,
  s.prevention, s.tags, u.id
FROM (VALUES
  (
    'Internet connectivity drops at the site',
    'internet-connectivity-drops-at-the-site',
    'The whole site loses internet while the LAN keeps working.',
    FALSE, 'NWL', 'internet-down', 'frequent', 'critical', 'site',
    '<p>Check the uplink light on the router. If it is off, ask facilities to confirm the circuit is powered, then power-cycle the router.</p>',
    '<p>All agents at the site report that web pages will not load, but internal applications and the softphone still work. The LAN is up - a ping to the local gateway succeeds.</p><p>Usually starts in the morning around 08:00 and affects the whole floor at once.</p>',
    '<ul><li>The upstream circuit has dropped (Meridian Telecom outage).</li><li>The router has lost its WAN address and has not reconnected.</li><li>A fibre uplink to a neighbouring room has been damaged.</li></ul>',
    '<p>Move affected agents to the secondary circuit if one is available, so the queue keeps running while the primary is diagnosed.</p>',
    '<ol><li>Confirm the outage is site-wide, not a single agent: ask two agents on different desks.</li><li>Check the router WAN status light. Off or red means the circuit is down.</li><li>Power-cycle the router: unplug the power, wait 30 seconds, plug it back in and allow 3 minutes to re-sync.</li><li>If the WAN light is still red after the power cycle, raise a fault with the ISP quoting the circuit reference.</li></ol>',
    '<p>Escalate to the Network Vendor Manager with the circuit reference, the site name and the time of onset. If more than 30 agents are affected, raise as a P1 and notify the account manager.</p>',
    '<p>The site has a second, failover circuit that is currently unpatched. Schedule a patching window so the next outage does not take the site offline.</p>',
    ARRAY['network','outage','recurring'],
    'NWL'
  ),
  (
    'Wi-Fi keeps dropping from the fifth floor',
    'wi-fi-keeps-dropping-from-the-fifth-floor',
    'Weak signal and disconnections on the top floor only.',
    FALSE, 'NWL', 'wi-fi', 'frequent', 'high', 'site',
    '<p>Move the agent to the fourth-floor hotspot for now, and raise a wireless survey for the fifth floor.</p>',
    '<p>Signal strength is reported as weak (1-2 bars) on the fifth floor. Connections drop every few minutes, especially near the meeting rooms at the north end.</p><p>The same laptops work fine on the fourth floor.</p>',
    '<ul><li>The fifth-floor access points are mounted behind partitions installed during the recent office refit.</li><li>Too many devices are associated with one access point because the others were decommissioned but not removed from the controller config.</li><li>Interference from the new microwave ovens in the kitchenette.</li></ul>',
    '<p>Issue a mobile hotspot or a USB ethernet adapter to the affected team until the survey is done.</p>',
    '<ol><li>Ask the agent to move away from the north meeting rooms and test again - this distinguishes interference from coverage.</li><li>Check the controller dashboard for the fifth-floor access points: confirm they are online and note the client count per AP.</li><li>If the client count is high, decommission the removed APs from the controller configuration.</li><li>Run a wireless survey to measure coverage and interference, then reposition or add access points.</li></ol>',
    '<p>Escalate to the Network Engineer with the survey results and the client counts. If the issue spreads to other floors, treat it as a site-wide incident.</p>',
    '<p>Do a wireless survey after every office refit, and add it to the refit checklist. The current coverage was never re-validated.</p>',
    ARRAY['network','recurring'],
    'NWL'
  ),
  (
    'VPN will not connect from home',
    'vpn-will-not-connect-from-home',
    'The client never gets past the gateway check when working from home.',
    FALSE, 'NWL', 'vpn', 'frequent', 'high', 'single_user',
    '<p>Confirm the agent can reach the public VPN gateway on port 443 from a phone on mobile data. If that works, the problem is the local network.</p>',
    '<p>The VPN client reports "gateway unreachable" or hangs on "authenticating". It started for one agent after they changed their home router.</p><p>Other agents in the same area are unaffected.</p>',
    '<ul><li>The home router blocks the VPN protocol on its outbound firewall.</li><li>The agent is double NAT-ing behind a second router they added themselves.</li><li>A stale credential cached in the client.</li></ul>',
    '<p>Have the agent try a phone hotspot. If it connects there, the issue is the home network, not the VPN.</p>',
    '<ol><li>Test on a mobile hotspot to isolate the home network from the VPN service.</li><li>If the hotspot works, ask the agent to check whether the home router has parental controls, VPN blocking, or a second router in bridge mode.</li><li>Clear the stored credentials in the VPN client and sign in again.</li><li>If the client still fails on a hotspot, reinstall the client from the software portal.</li></ol>',
    '<p>Escalate to the Network Engineer if the client fails on multiple networks - that points at the VPN gateway or a client version issue.</p>',
    '<p>Publish a short self-service guide covering home router settings, and link it from the remote-working policy.</p>',
    ARRAY['network','vpn'],
    'NWL'
  ),
  (
    'Cannot sign in to the CRM - password rejected',
    'cannot-sign-in-to-the-crm-password-rejected',
    'Valid credentials are rejected by the CRM login page.',
    FALSE, 'NWL', 'crm', 'frequent', 'medium', 'single_user',
    '<p>Have the agent sign in through the single sign-on link on the intranet start page rather than typing the password directly.</p>',
    '<p>The CRM login rejects the password with "invalid credentials" even though the agent has just reset it successfully on the domain.</p><p>The agent has just returned from leave.</p>',
    '<ul><li>The CRM was not yet updated with the new password hash.</li><li>The agent is typing the old password from a saved note.</li><li>Too many failed attempts locked the account.</li></ul>',
    '<p>Use the CRM read-only view from the agent console so they can still look up account information while access is fixed.</p>',
    '<ol><li>Check the account is not locked: an administrator can see the failed-attempt count on the user record.</li><li>Ask the agent to use the single sign-on link from the intranet start page, which passes the domain credentials through.</li><li>Reset the CRM password and have the agent set a new one immediately, rather than using a temporary one.</li><li>If the lock is the cause, unlock the account and confirm the reset link was delivered to the correct mailbox.</li></ol>',
    '<p>Escalate to Identity and Access Management if the SSO route also fails.</p>',
    '<p>Remove the separate CRM password entirely and rely on single sign-on - that removes a whole class of this problem.</p>',
    ARRAY['access','recurring'],
    'NWL'
  ),
  (
    'VDI session disconnects and cannot reconnect',
    'vdi-session-disconnects-and-cannot-reconnect',
    'The agent loses their Citrix session and the client refuses to reconnect.',
    FALSE, 'NWL', 'vdi-citrix', 'frequent', 'high', 'single_user',
    '<p>Ask the agent to close the Citrix client completely and reopen it. A stale client process often blocks the reconnection.</p>',
    '<p>The Citrix session disconnects, and reconnection fails with "the server is busy" or a timeout. The agent is working on the same data as everyone else.</p>',
    '<ul><li>A stale Citrix process on the workstation holds the session.</li><li>The agent machine has run out of disk space and Citrix cannot write its local cache.</li><li>The Citrix gateway is saturated at that time of day.</li></ul>',
    '<p>Direct the agent to a spare workstation, and make sure they save their work before anything else.</p>',
    '<ol><li>Close the Citrix client fully, including the system tray icon, and reopen it.</li><li>Check free disk space on the workstation. Clear the Citrix cache under %LOCALAPPDATA% if space is short.</li><li>Reboot the workstation if the client still refuses to reconnect.</li><li>Check the Citrix gateway dashboard for concurrent-session limits, particularly during the shift-change window.</li></ol>',
    '<p>Escalate to the Virtualisation team if the gateway is at its session limit, with the timestamp and the agent count affected.</p>',
    '<p>Monitor disk space on workstations and alert before the Citrix cache fills, rather than after users lose sessions.</p>',
    ARRAY['hardware','recurring'],
    'NWL'
  ),
  (
    'Outbound email is rejected by the recipient server',
    'outbound-email-is-rejected-by-the-recipient-server',
    'Recipients report the email never arrived and the sender gets no error.',
    FALSE, 'NWL', 'email-calendar', 'one_off', 'medium', 'single_user',
    '<p>Ask the agent to send a test message to a personal address and then check the Sent folder for a non-delivery report.</p>',
    '<p>Emails to a specific external domain are not arriving. The recipient says nothing was received, and no error appears in the agent client.</p><p>Other external domains work normally.</p>',
    '<ul><li>The sending domain was added to a blocklist by the recipient provider.</li><li>A reverse DNS record for the outbound IP is missing or misconfigured.</li><li>The message was silently discarded by a spam filter because it had no SPF record.</li></ul>',
    '<p>Use an alternative channel - phone or the customer portal - to confirm anything time-critical, and tell the recipient the email will follow.</p>',
    '<ol><li>Check the Sent folder for a non-delivery report that the client may have hidden.</li><li>Send a test message to an external mailbox and look at the delivery status.</li><li>Check the outbound mail logs for the recipient domain to see the exact rejection reason and the receiving server.</li><li>If the rejection is a blocklist entry, contact the recipient provider to request a review - it usually takes a few days.</li></ol>',
    '<p>Escalate to the Messaging team with the delivery logs and the receiving server name.</p>',
    '<p>Keep SPF, DKIM and reverse DNS aligned with the sending domain, and review them whenever the outbound IP changes.</p>',
    ARRAY['email'],
    'NWL'
  ),
  (
    'Laptop runs out of disk space and slows to a crawl',
    'laptop-runs-out-of-disk-space-and-slows-to-a-crawl',
    'The machine is extremely slow and Windows warns that the drive is nearly full.',
    FALSE, 'NWL', 'hardware', 'frequent', 'low', 'single_user',
    '<p>Clear the Downloads folder and the Windows temporary files, then restart. That usually recovers enough space to work.</p>',
    '<p>The laptop is slow to start and to open applications. Windows shows a warning that the system drive is nearly full.</p><p>The agent works with large PDF files downloaded from the client portal.</p>',
    '<ul><li>Downloaded PDFs and exports have filled the drive.</li><li>The Recycle Bin and the Windows Update cache are taking a large share.</li><li>The system drive is smaller than the image expects.</li></ul>',
    '<p>Move large working files to the network share and delete the local copies. This is the fastest way to recover performance.</p>',
    '<ol><li>Check the free space on the system drive in File Explorer.</li><li>Empty the Recycle Bin and run Disk Cleanup on the system drive.</li><li>Move anything large out of Downloads onto the network share, and empty that folder.</li><li>If the drive is a small SSD, request a larger drive through IT - that is a permanent fix.</li></ol>',
    '<p>Escalate to the Workplace Technology team for a disk upgrade or replacement if the free space cannot be recovered.</p>',
    '<p>Set a policy that saves large downloads to the network share by default, and check drive free space through the management tool.</p>',
    ARRAY['hardware','recurring'],
    'NWL'
  ),
  (
    'Docking station not detecting the external monitors',
    'docking-station-not-detecting-the-external-monitors',
    'External screens stay blank when the laptop is docked.',
    FALSE, 'NWL', 'hardware', 'anticipated', 'low', 'single_user',
    '<p>Unplug and replug the USB-C cable at both ends, then press the display-switch key. A loose USB-C connection is the usual cause.</p>',
    '<p>The laptop works normally undocked, but the two external monitors stay black when the workstation is docked.</p><p>The laptop screen works, and the monitors show "no signal".</p>',
    '<ul><li>The USB-C cable is not seated properly, or is a charge-only cable.</li><li>The docking station firmware needs updating.</li><li>Windows is holding a stale display configuration.</li></ul>',
    '<p>Work from the laptop screen until the dock is fixed - the agent can still work, it is just less comfortable.</p>',
    '<ol><li>Unplug the USB-C cable from both the dock and the laptop and reconnect it firmly, then press the display-switch key (usually Fn plus a screen icon).</li><li>Try a different USB-C port on the laptop, if it has more than one.</li><li>Open Settings > System > Display and press Detect. If the monitors appear, set the resolution and choose "Extend" rather than "Duplicate".</li><li>Update the docking station firmware and the graphics driver from the management tool.</li></ol>',
    '<p>Escalate to Workplace Technology for a replacement dock or cable if the display is still not detected.</p>',
    '<p>Standardise on a single tested dock and cable model for the floor, so there is one thing to troubleshoot.</p>',
    ARRAY['hardware'],
    'NWL'
  ),
  (
    'Microsoft Teams: no audio in the meeting',
    'microsoft-teams-no-audio-in-the-meeting',
    'The agent joins the call but nobody can hear them.',
    FALSE, 'HLC', 'ms-teams', 'frequent', 'high', 'single_user',
    '<p>Ask the agent to leave and rejoin the meeting using "Join now" with the device picker, choosing their headset explicitly.</p>',
    '<p>The agent is in the meeting and can see the other participants, but no one hears them. Their microphone indicator is greyed out.</p><p>They can hear everyone else.</p>',
    '<ul><li>Teams selected the wrong input device after a headset was reconnected.</li><li>A stale session holds the microphone.</li><li>The Windows privacy setting blocks the microphone for desktop applications.</li></ul>',
    '<p>Have the agent dial into the meeting from their desk phone using the dial-in number, so they can keep working while IT looks at the device.</p>',
    '<ol><li>Open Teams, go to the meeting controls, open the device settings and check that the right headset is selected as both the microphone and the speaker.</li><li>Check the microphone is not muted in the Windows taskbar, and that the correct device is selected as the default in Windows sound settings.</li><li>Close Teams completely (including the system tray icon) and rejoin the meeting.</li><li>If it still fails, check Settings > Privacy > Microphone and confirm desktop apps can access it.</li></ol>',
    '<p>Escalate to the Workplace Technology team if the device is confirmed correct and the issue follows the user to another machine.</p>',
    '<p>Add a self-service article with screenshots of the device picker - this is the single most common step that resolves it.</p>',
    ARRAY['teams','recurring'],
    'HLC'
  ),
  (
    'Microsoft Teams: camera not working in a meeting',
    'microsoft-teams-camera-not-working-in-a-meeting',
    'Video is off for the agent and cannot be switched on.',
    FALSE, 'HLC', 'ms-teams', 'anticipated', 'low', 'single_user',
    '<p>Check that no other application is holding the camera - a browser and the native client both trying to use it will disable it.</p>',
    '<p>The camera preview is blank and the "Turn on camera" button does nothing. The agent has used Teams video successfully before.</p>',
    '<ul><li>Another application (a browser tab, a conferencing tool) is holding the camera exclusively.</li><li>The Windows privacy setting blocks camera access for desktop apps.</li><li>The camera driver failed after a Windows update.</li></ul>',
    '<p>The agent can still take part with audio only, so there is no need to cancel the meeting.</p>',
    '<ol><li>Ask the agent to close every browser and video application and try again.</li><li>Check Settings > Privacy > Camera and confirm both "Allow access" and "Let desktop apps access" are on.</li><li>In Device Manager, check the camera is not showing an error triangle; if it is, the driver needs updating.</li><li>Test the camera in the Windows Camera app - if it fails there too, the problem is the hardware or driver, not Teams.</li></ol>',
    '<p>Escalate to Workplace Technology for a driver update or a hardware replacement if the camera fails in the Windows Camera app.</p>',
    '<p>Include a link to the Windows Camera app in the self-service article, so the first check is the fastest one.</p>',
    ARRAY['teams','hardware'],
    'HLC'
  ),
  (
    'Softphone will not register with the telephony server',
    'softphone-will-not-register-with-the-telephony-server',
    'The softphone shows "not connected" and cannot make or take calls.',
    FALSE, 'CRH', 'softphone-dialer', 'frequent', 'critical', 'single_user',
    '<p>Check the agent has selected the correct site in the softphone dropdown, then press "Reconnect" in the status bar.</p>',
    '<p>The softphone status bar shows a red indicator and "Not registered". The agent cannot make outgoing calls or receive incoming ones.</p><p>Other agents on the same floor are registered fine.</p>',
    '<ul><li>The agent is signed in to the wrong site or tenant.</li><li>The SIP credential has expired - this happens after a password change on the domain.</li><li>A stale session from a previous login is holding the registration.</li></ul>',
    '<p>Direct the agent to a physical desk phone if one is available, so calls are not missed while the softphone is fixed.</p>',
    '<ol><li>Open the softphone settings and confirm the site matches the agent location. A mismatch silently prevents registration.</li><li>Sign out completely and sign back in with the current domain credentials.</li><li>Check the softphone service is running on the agent machine.</li><li>Restart the workstation and try again - this clears a stale SIP session.</li></ol>',
    '<p>Escalate to the Telephony team with the agent name, site, and the exact error text. If several agents at the same site are affected, treat it as a server-side issue.</p>',
    '<p>Force the softphone to re-authenticate when the domain password changes, rather than holding stale credentials.</p>',
    ARRAY['softphone','recurring'],
    'CRH'
  ),
  (
    'Softphone: calls drop after two minutes',
    'softphone-calls-drop-after-two-minutes',
    'Calls connect and then disconnect on their own after a couple of minutes.',
    FALSE, 'CRH', 'softphone-dialer', 'frequent', 'high', 'single_user',
    '<p>Ask the agent to try a wired headset. Wireless headsets are the most common cause of a mid-call drop on this setup.</p>',
    '<p>Outbound calls connect normally, but after roughly two minutes of talking the call disconnects. The agent then has to redial.</p><p>The agent recently started using a new wireless headset.</p>',
    '<ul><li>The wireless headset is losing its connection to the dongle and the softphone drops the call with it.</li><li>Power management is disabling the network adapter during the call.</li><li>The handset is on a congested Wi-Fi channel.</li></ul>',
    '<p>Switch the agent to a wired headset or the desk phone until the headset is replaced.</p>',
    '<ol><li>Confirm whether the drop coincides with the agent moving - if so, it is the wireless headset.</li><li>Test with a wired headset. If the call holds, the headset is the cause.</li><li>If it still drops on a wired headset, check the power management settings and disable the network adapter sleep mode.</li><li>Check the softphone log for a SIP BYE or a media timeout, and send it to the Telephony team.</li></ol>',
    '<p>Escalate to the Telephony team with the softphone log if a wired headset still drops.</p>',
    '<p>Only approve wireless headsets that are on the tested-hardware list for the softphone fleet.</p>',
    ARRAY['softphone','hardware','recurring'],
    'CRH'
  ),
  (
    'Shared mailbox is missing messages',
    'shared-mailbox-is-missing-messages',
    'Messages sent to a shared mailbox do not appear in it.',
    FALSE, 'CRH', 'email-calendar', 'anticipated', 'low', 'team',
    '<p>Check the mailbox is still connected to the account. An unconnected shared mailbox keeps collecting mail invisibly.</p>',
    '<p>Messages sent to the shared mailbox address do not appear for any member. Individual users can see the mailbox listed in Outlook, but it appears empty.</p>',
    '<ul><li>The shared mailbox was unlinked from its members when permissions were migrated.</li><li>A message was moved to an archive folder by a rule that one member owns.</li><li>The mailbox has exceeded its size limit and is silently rejecting new mail.</li></ul>',
    '<p>Ask the sender to copy the recipient, so the message is not lost while this is investigated.</p>',
    '<ol><li>Open the shared mailbox in Outlook and check the Archive and Junk folders - a rule may have redirected the messages.</li><li>Check the mailbox size against the account limit.</li><li>Re-add the permissions for each member: Full Access, but not Send As, unless the workflow needs it.</li><li>Test by sending a message from outside the organisation and watching where it lands.</li></ol>',
    '<p>Escalate to the Messaging team if the mailbox is within its size limit and the permissions are correct - this is then a delivery-path problem.</p>',
    '<p>Review the archive policies for shared mailboxes, and check their sizes on a monthly schedule rather than after a complaint.</p>',
    ARRAY['email'],
    'CRH'
  ),
  (
    'Global: how to raise a P1 incident',
    'global-how-to-raise-a-p1-incident',
    'The process for declaring and escalating a P1, whichever account it is for.',
    TRUE, NULL, 'incident-process', 'anticipated', 'high', 'company_wide',
    '<p>Call the duty phone on the escalation card, then log the incident in the ticket system within 15 minutes.</p>',
    '<p>This is the shared procedure for declaring a P1: what qualifies, who to call, and what to tell them.</p>',
    '<ul><li>Not applicable - this is a procedure, not a fault.</li></ul>',
    '<p>Not applicable.</p>',
    '<ol><li>Confirm it is a P1: a complete site outage, a data loss, or a security incident.</li><li>Call the duty phone on the escalation card. Do not wait for email.</li><li>Log the incident in the ticket system within 15 minutes, with the time of onset and the number of users affected.</li><li>Assign an incident lead and keep a running note of every action taken.</li><li>Update the customer contact every 30 minutes until the incident is resolved.</li></ol>',
    '<p>The incident lead escalates to the Account Director if the outage is expected to last more than two hours.</p>',
    '<p>Review this procedure after every P1 and adjust it. It is the one document every role depends on.</p>',
    ARRAY['escalation'],
    'NWL'
  ),
  (
    'Global: recognising a phishing email',
    'global-recognising-a-phishing-email',
    'What a phishing attempt looks like and what to do about it.',
    TRUE, NULL, 'security', 'one_off', 'medium', 'company_wide',
    '<p>Do not click anything. Forward the message to the security inbox as an attachment, then report it with the phish-report button.</p>',
    '<p>A guidance note on how to spot a phishing message, and the reporting route for it.</p>',
    '<ul><li>Not applicable - this is guidance, not a fault.</li></ul>',
    '<p>Not applicable.</p>',
    '<ol><li>Check the sender address - look carefully at the domain, not just the display name.</li><li>Hover over every link without clicking and check where it actually points.</li><li>Look for urgency, an unexpected attachment, or a request to change payment details.</li><li>Forward the email to the security inbox with the "phish" subject, then use the report button in your mail client.</li><li>If you already clicked, disconnect from the network and call the security desk immediately - that is not a disciplinary matter.</li></ol>',
    '<p>The security desk handles the containment and the account-wide notification.</p>',
    '<p>Run a short phishing simulation each quarter and publish the results so the recognition improves.</p>',
    ARRAY['email','escalation'],
    'NWL'
  ),
  (
    'Global: password reset and account unlock',
    'global-password-reset-and-account-unlock',
    'The steps to reset a domain password and unlock a locked account.',
    TRUE, NULL, 'access-login', 'frequent', 'low', 'company_wide',
    '<p>Use the self-service reset page at the link on the intranet start page. The new password is valid immediately on the domain, but the CRM and the softphone pick it up within about 15 minutes.</p>',
    '<p>The shared procedure for resetting a password and unlocking an account.</p>',
    '<ul><li>Not applicable - this is a procedure, not a fault.</li></ul>',
    '<p>Not applicable.</p>',
    '<ol><li>Confirm the agent is using the self-service portal on the intranet, not a link from an email.</li><li>Check the account is not locked before the reset; unlocking and resetting are separate actions.</li><li>After the reset, tell the agent that the CRM and the softphone need up to 15 minutes to accept the new password.</li><li>If the agent has no self-service access, escalate to the service desk with their employee number and the account name.</li></ol>',
    '<p>The service desk handles resets for accounts that have lost self-service access.</p>',
    '<p>Keep the self-service reset page linked from the intranet start page only, so it is not reachable from a phishing email.</p>',
    ARRAY['access','recurring'],
    'NWL'
  )
) AS s(
  title, slug, summary, is_global, account_code, category_slug, issue_type_value,
  severity_value, impact_scope_value, quick_fix, symptoms, causes, workarounds,
  resolutions, escalation, prevention, tags, owner_code
)
JOIN pb_accounts a ON a.code = COALESCE(s.account_code, s.owner_code)
JOIN pb_categories c ON c.slug = s.category_slug
JOIN pb_criteria_options ot
  ON ot.value = s.issue_type_value
  AND ot.field_id = (SELECT id FROM pb_criteria_fields WHERE key = 'issue_type')
JOIN pb_criteria_options sev
  ON sev.value = s.severity_value
  AND sev.field_id = (SELECT id FROM pb_criteria_fields WHERE key = 'severity')
JOIN pb_criteria_options isc
  ON isc.value = s.impact_scope_value
  AND isc.field_id = (SELECT id FROM pb_criteria_fields WHERE key = 'impact_scope')
LEFT JOIN auth.users u ON u.email = 'admin@bosp.local'
WHERE NOT EXISTS (SELECT 1 FROM pb_scenarios x WHERE x.slug = s.slug);

-- The global scenarios must not carry a primary account. The join above gives
-- them the admin's account for the created_by lookup, so it is cleared here.
UPDATE pb_scenarios
SET account_id = NULL
WHERE is_global = TRUE
  AND slug IN (
    'global-how-to-raise-a-p1-incident',
    'global-recognising-a-phishing-email',
    'global-password-reset-and-account-unlock'
  );

-- ---------------------------------------------------------------------------
-- Account links
--
-- A scenario can apply to more than one account. The Teams and hardware
-- scenarios apply to both, which is what makes the "common to all selected
-- accounts" filter meaningful.
-- ---------------------------------------------------------------------------
INSERT INTO pb_scenario_accounts (scenario_id, account_id)
SELECT s.id, a.id
FROM pb_scenarios s
CROSS JOIN pb_accounts a
WHERE s.slug IN (
  'microsoft-teams-no-audio-in-the-meeting',
  'microsoft-teams-camera-not-working-in-a-meeting',
  'laptop-runs-out-of-disk-space-and-slows-to-a-crawl',
  'docking-station-not-detecting-the-external-monitors'
)
  AND a.code IN ('NWL', 'HLC')
ON CONFLICT DO NOTHING;

-- The primary account link for every non-global scenario.
INSERT INTO pb_scenario_accounts (scenario_id, account_id)
SELECT s.id, s.account_id
FROM pb_scenarios s
WHERE s.account_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Custom criteria values
--
-- These prove the EAV path works alongside the system columns, and they feed
-- the ISP/Vendor and Shift facets in the search rail.
-- ---------------------------------------------------------------------------
INSERT INTO pb_scenario_criteria_values (scenario_id, field_id, option_id)
SELECT s.id, isp.id, io.id
FROM (VALUES
  ('internet-connectivity-drops-at-the-site', 'meridian', 'early'),
  ('wi-fi-keeps-dropping-from-the-fifth-floor', 'in-house', 'early'),
  ('vpn-will-not-connect-from-home', 'broadpath', 'late'),
  ('softphone-will-not-register-with-the-telephony-server', 'telecom-voice', 'early'),
  ('softphone-calls-drop-after-two-minutes', 'telecom-voice', 'late'),
  ('microsoft-teams-no-audio-in-the-meeting', 'in-house', 'late'),
  ('cannot-sign-in-to-the-crm-password-rejected', 'vantage', 'early')
) AS v(slug, isp_value, shift_value)
JOIN pb_scenarios s ON s.slug = v.slug
JOIN pb_criteria_fields isp ON isp.key = 'isp_vendor'
JOIN pb_criteria_options io ON io.field_id = isp.id AND io.value = v.isp_value
JOIN pb_criteria_fields sh ON sh.key = 'shift'
JOIN pb_criteria_options so ON so.field_id = sh.id AND so.value = v.shift_value
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sample tickets
--
-- Each one updates the scenario's occurrence count and last-occurred date
-- through the database trigger, so the seeded occurrence counts are derived
-- rather than invented.
-- ---------------------------------------------------------------------------
INSERT INTO pb_sample_tickets (scenario_id, ticket_id, ticket_date, reporter, site, problem_reported, observed, action_taken, outcome_id, resolution_notes)
SELECT
  s.id, v.ticket_id, v.ticket_date::date, v.reporter, v.site, v.problem, v.observed,
  v.action, o.id, v.notes
FROM (VALUES
  ('internet-connectivity-drops-at-the-site', 'INC-48213', '2026-08-04', 'Site Manager, Northwind Dock 2', 'Northwind Dock 2', 'No internet this morning, whole floor affected', 'Router WAN light is red, LAN is fine', 'Power-cycled the router, fault raised with Meridian', 'resolved', 'Circuit fault, restored within 40 minutes'),
  ('internet-connectivity-drops-at-the-site', 'INC-49002', '2026-09-11', 'Shift Supervisor', 'Northwind Dock 2', 'Same again, nothing loading in the browser', 'WAN light red again, ISP confirmed an outage in the area', 'Raised a second fault, used the failover circuit for the shift', 'no_action', 'Meridian outage, no action needed from us'),
  ('internet-connectivity-drops-at-the-site', 'INC-50117', '2026-10-02', 'Floor Lead', 'Northwind Dock 2', 'Intermittent drops through the morning', 'WAN light flickering, router logs show repeated re-syncs', 'Swapped the router for the spare, logged a hardware replacement', 'resolved', 'Router PSU was failing'),
  ('wi-fi-keeps-dropping-from-the-fifth-floor', 'INC-48340', '2026-08-19', 'Team Leader', 'Northwind Floor 5', 'Wi-Fi drops every few minutes up here', 'Signal 1-2 bars near the north meeting rooms', 'Moved the team to the fourth floor, booked a survey', 'workaround', 'Access point behind a partition, survey scheduled'),
  ('wi-fi-keeps-dropping-from-the-fifth-floor', 'INC-49755', '2026-09-30', 'Agent', 'Northwind Floor 5', 'Constant disconnections on the top floor', 'Client count on AP-5 is 34', 'Decommissioned the two removed APs from the controller', 'resolved', 'Coverage improved, client count back to normal'),
  ('vpn-will-not-connect-from-home', 'INC-48601', '2026-09-03', 'Agent, remote', 'Home', 'VPN says gateway unreachable', 'Works on a phone hotspot, fails on home Wi-Fi', 'Home router had a second router behind it', 'resolved', 'Agent put the second router into bridge mode'),
  ('softphone-will-not-register-with-the-telephony-server', 'INC-48115', '2026-07-28', 'Team Leader', 'Crestline Floor 1', 'Softphone will not register, cannot take calls', 'Status bar red, correct site selected', 'Re-authenticated with the current domain credentials', 'resolved', 'Password had changed, not yet synced'),
  ('softphone-will-not-register-with-the-telephony-server', 'INC-49422', '2026-09-18', 'Agent', 'Crestline Floor 2', 'Not registered since this morning', 'Wrong site selected in the dropdown', 'Corrected the site and reconnected', 'resolved', 'Simple misconfiguration'),
  ('microsoft-teams-no-audio-in-the-meeting', 'INC-48470', '2026-08-27', 'Agent, remote', 'Home', 'In the Teams meeting but nobody can hear me', 'Microphone greyed out in Teams', 'Rejoined using the device picker', 'resolved', 'Teams had selected the wrong input device'),
  ('microsoft-teams-no-audio-in-the-meeting', 'INC-49883', '2026-10-05', 'Team Leader', 'Halcyon Home', 'No audio in the client call', 'Wrong headset selected after a reconnect', 'Selected the headset explicitly, rejoined', 'resolved', 'Device selection, not a hardware fault'),
  ('softphone-calls-drop-after-two-minutes', 'INC-48980', '2026-09-08', 'Agent', 'Crestline Floor 3', 'Calls drop after about two minutes', 'Started after the new wireless headset', 'Switched to a wired headset, call held', 'workaround', 'Headset replaced under warranty')
) AS v(slug, ticket_id, ticket_date, reporter, site, problem, observed, action, outcome_value, notes)
JOIN pb_scenarios s ON s.slug = v.slug
JOIN pb_outcomes o ON o.value = v.outcome_value
WHERE NOT EXISTS (
  SELECT 1 FROM pb_sample_tickets t WHERE t.scenario_id = s.id AND t.ticket_id = v.ticket_id
);

-- ---------------------------------------------------------------------------
-- Flowcharts
--
-- Five scenarios get a guided troubleshooting flow: Internet Down, Wi-Fi,
-- VPN, Teams audio, and Softphone.
-- ---------------------------------------------------------------------------
INSERT INTO pb_flowcharts (scenario_id, nodes, edges)
SELECT s.id, v.nodes::jsonb, v.edges::jsonb
FROM (VALUES
  (
    'internet-connectivity-drops-at-the-site',
    '[
      {"id":"n1","type":"flowNode","position":{"x":80,"y":40},"data":{"label":"Confirm the outage is site-wide","nodeType":"start","description":"Ask two agents on different desks. If only one, it is a client issue, not an outage."}},
      {"id":"n2","type":"flowNode","position":{"x":80,"y":180},"data":{"label":"Check the router WAN light","nodeType":"decision","description":"Is the WAN status light on and steady?"}},
      {"id":"n3","type":"flowNode","position":{"x":360,"y":300},"data":{"label":"Power-cycle the router","nodeType":"action","description":"Unplug, wait 30 seconds, plug back in, allow 3 minutes to re-sync."}},
      {"id":"n4","type":"flowNode","position":{"x":360,"y":100},"data":{"label":"Check the client network settings","nodeType":"workaround","description":"Confirm the agent has not set a static IP or a custom DNS that no longer resolves."}},
      {"id":"n5","type":"flowNode","position":{"x":640,"y":180},"data":{"label":"Raise an ISP fault","nodeType":"escalate","description":"Raise with the ISP quoting the circuit reference, the site name and the time of onset."}},
      {"id":"n6","type":"flowNode","position":{"x":640,"y":380},"data":{"label":"Site is back online","nodeType":"resolution","description":"Confirm browsing, softphone and the client portal all work. Record the resolution on the ticket."}},
      {"id":"n7","type":"flowNode","position":{"x":900,"y":280},"data":{"label":"Escalate to the Network Vendor Manager","nodeType":"escalate","description":"More than 30 agents affected, or the fault has been open for over an hour."}}
    ]'::jsonb,
    '[
      {"id":"e1","source":"n1","target":"n2"},
      {"id":"e2","source":"n2","target":"n3","label":"No"},
      {"id":"e3","source":"n2","target":"n4","label":"Yes"},
      {"id":"e4","source":"n3","target":"n5","label":"No"},
      {"id":"e5","source":"n3","target":"n6","label":"Yes"},
      {"id":"e6","source":"n4","target":"n5","label":"No"},
      {"id":"e7","source":"n4","target":"n6","label":"Yes"},
      {"id":"e8","source":"n5","target":"n7","label":"No"},
      {"id":"e9","source":"n5","target":"n6","label":"Yes"}
    ]'::jsonb
  ),
  (
    'wi-fi-keeps-dropping-from-the-fifth-floor',
    '[
      {"id":"n1","type":"flowNode","position":{"x":80,"y":40},"data":{"label":"Confirm the issue is floor-specific","nodeType":"start","description":"Ask the agent to test on the fourth floor. If it works there, this is a coverage issue."}},
      {"id":"n2","type":"flowNode","position":{"x":80,"y":180},"data":{"label":"Move away from the north meeting rooms","nodeType":"decision","description":"Does the signal stabilise away from the meeting rooms?"}},
      {"id":"n3","type":"flowNode","position":{"x":380,"y":100},"data":{"label":"Suspect interference","nodeType":"workaround","description":"The kitchenette appliances and the meeting room equipment are the usual culprits."}},
      {"id":"n4","type":"flowNode","position":{"x":380,"y":300},"data":{"label":"Check the access point client count","nodeType":"action","description":"Open the controller and note the client count for each fifth-floor access point."}},
      {"id":"n5","type":"flowNode","position":{"x":680,"y":300},"data":{"label":"Decommission the removed access points","nodeType":"action","description":"The refit removed two access points. Remove them from the controller configuration."}},
      {"id":"n6","type":"flowNode","position":{"x":680,"y":100},"data":{"label":"Schedule a wireless survey","nodeType":"escalate","description":"The Network Engineer needs coverage and interference measurements to reposition or add access points."}},
      {"id":"n7","type":"flowNode","position":{"x":960,"y":200},"data":{"label":"Coverage resolved","nodeType":"resolution","description":"Confirm the signal at the problem locations, then close the ticket."}}
    ]'::jsonb,
    '[
      {"id":"e1","source":"n1","target":"n2"},
      {"id":"e2","source":"n2","target":"n3","label":"Yes"},
      {"id":"e3","source":"n2","target":"n4","label":"No"},
      {"id":"e4","source":"n4","target":"n5","label":"Yes"},
      {"id":"e5","source":"n4","target":"n6","label":"No"},
      {"id":"e6","source":"n5","target":"n7","label":"Yes"},
      {"id":"e7","source":"n6","target":"n7","label":"Yes"}
    ]'::jsonb
  ),
  (
    'vpn-will-not-connect-from-home',
    '[
      {"id":"n1","type":"flowNode","position":{"x":80,"y":40},"data":{"label":"Test on a mobile hotspot","nodeType":"start","description":"This single step separates the home network from the VPN service."}},
      {"id":"n2","type":"flowNode","position":{"x":80,"y":180},"data":{"label":"Does it connect on the hotspot?","nodeType":"decision","description":"If yes, the VPN is fine and the home network is the problem."}},
      {"id":"n3","type":"flowNode","position":{"x":380,"y":100},"data":{"label":"Clear the stored credentials","nodeType":"action","description":"Remove the saved password from the client and sign in again."}},
      {"id":"n4","type":"flowNode","position":{"x":380,"y":300},"data":{"label":"Check the home router","nodeType":"action","description":"Look for a second router, parental controls, or a firewall rule blocking the VPN."}},
      {"id":"n5","type":"flowNode","position":{"x":680,"y":100},"data":{"label":"Reinstall the client","nodeType":"action","description":"Install the current build from the software portal."}},
      {"id":"n6","type":"flowNode","position":{"x":680,"y":300},"data":{"label":"Escalate to the Network Engineer","nodeType":"escalate","description":"The client fails on multiple networks, which points at the gateway or a client version issue."}},
      {"id":"n7","type":"flowNode","position":{"x":960,"y":200},"data":{"label":"Connection restored","nodeType":"resolution","description":"Confirm the agent can reach the internal applications over the VPN."}}
    ]'::jsonb,
    '[
      {"id":"e1","source":"n1","target":"n2"},
      {"id":"e2","source":"n2","target":"n3","label":"No"},
      {"id":"e3","source":"n2","target":"n4","label":"Yes"},
      {"id":"e4","source":"n3","target":"n5","label":"No"},
      {"id":"e5","source":"n3","target":"n7","label":"Yes"},
      {"id":"e6","source":"n4","target":"n7","label":"Yes"},
      {"id":"e7","source":"n4","target":"n6","label":"No"},
      {"id":"e8","source":"n5","target":"n7","label":"Yes"},
      {"id":"e9","source":"n5","target":"n6","label":"No"}
    ]'::jsonb
  ),
  (
    'microsoft-teams-no-audio-in-the-meeting',
    '[
      {"id":"n1","type":"flowNode","position":{"x":80,"y":40},"data":{"label":"Check the device picker","nodeType":"start","description":"Open the meeting controls, then the device settings. Is the right headset selected as both microphone and speaker?"}},
      {"id":"n2","type":"flowNode","position":{"x":80,"y":180},"data":{"label":"Is the correct device selected?","nodeType":"decision","description":"Teams often keeps the previous device after a headset reconnect."}},
      {"id":"n3","type":"flowNode","position":{"x":380,"y":100},"data":{"label":"Select the headset explicitly","nodeType":"action","description":"Pick the headset from the dropdown in the device settings, then apply."}},
      {"id":"n4","type":"flowNode","position":{"x":380,"y":300},"data":{"label":"Close Teams completely and rejoin","nodeType":"action","description":"Close the system tray icon too. A stale session holds the microphone."}},
      {"id":"n5","type":"flowNode","position":{"x":680,"y":100},"data":{"label":"Check the Windows privacy setting","nodeType":"action","description":"Settings > Privacy > Microphone > allow desktop apps."}},
      {"id":"n6","type":"flowNode","position":{"x":680,"y":300},"data":{"label":"Escalate to Workplace Technology","nodeType":"escalate","description":"The device is confirmed correct and the fault follows the user to another machine."}},
      {"id":"n7","type":"flowNode","position":{"x":960,"y":200},"data":{"label":"Audio working","nodeType":"resolution","description":"Confirm both directions on a test call before closing the ticket."}}
    ]'::jsonb,
    '[
      {"id":"e1","source":"n1","target":"n2"},
      {"id":"e2","source":"n2","target":"n3","label":"No"},
      {"id":"e3","source":"n2","target":"n4","label":"Yes"},
      {"id":"e4","source":"n3","target":"n4","label":"Yes"},
      {"id":"e5","source":"n4","target":"n5","label":"No"},
      {"id":"e6","source":"n4","target":"n7","label":"Yes"},
      {"id":"e7","source":"n5","target":"n7","label":"Yes"},
      {"id":"e8","source":"n5","target":"n6","label":"No"},
      {"id":"e9","source":"n6","target":"n7","label":"Yes"}
    ]'::jsonb
  ),
  (
    'softphone-will-not-register-with-the-telephony-server',
    '[
      {"id":"n1","type":"flowNode","position":{"x":80,"y":40},"data":{"label":"Check the selected site","nodeType":"start","description":"Open the softphone settings. A site mismatch prevents registration silently."}},
      {"id":"n2","type":"flowNode","position":{"x":80,"y":180},"data":{"label":"Is the site correct?","nodeType":"decision","description":"Compare it with the agent location and with a colleague who is registered."}},
      {"id":"n3","type":"flowNode","position":{"x":380,"y":100},"data":{"label":"Select the correct site and reconnect","nodeType":"action","description":"Use the status bar reconnect button."}},
      {"id":"n4","type":"flowNode","position":{"x":380,"y":300},"data":{"label":"Sign out and sign in again","nodeType":"action","description":"Use the current domain credentials. The SIP credential expires on a password change."}},
      {"id":"n5","type":"flowNode","position":{"x":680,"y":300},"data":{"label":"Restart the workstation","nodeType":"action","description":"Clears a stale SIP session that blocks re-registration."}},
      {"id":"n6","type":"flowNode","position":{"x":680,"y":100},"data":{"label":"Escalate to the Telephony team","nodeType":"escalate","description":"Several agents at the same site are affected, so this is server-side."}},
      {"id":"n7","type":"flowNode","position":{"x":960,"y":200},"data":{"label":"Softphone registered","nodeType":"resolution","description":"Confirm the status bar is green and that an outbound test call connects."}}
    ]'::jsonb,
    '[
      {"id":"e1","source":"n1","target":"n2"},
      {"id":"e2","source":"n2","target":"n3","label":"No"},
      {"id":"e3","source":"n2","target":"n4","label":"Yes"},
      {"id":"e4","source":"n3","target":"n7","label":"Yes"},
      {"id":"e5","source":"n4","target":"n5","label":"No"},
      {"id":"e6","source":"n4","target":"n7","label":"Yes"},
      {"id":"e7","source":"n5","target":"n7","label":"Yes"},
      {"id":"e8","source":"n5","target":"n6","label":"No"}
    ]'::jsonb
  )
) AS v(slug, nodes, edges)
JOIN pb_scenarios s ON s.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM pb_flowcharts f WHERE f.scenario_id = s.id);

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
INSERT INTO pb_templates (name, key, description, criteria_defaults, sections_content, is_global, is_active)
VALUES
  (
    'Network incident',
    'network-incident',
    'A site or circuit level outage affecting multiple users.',
    '{"issue_type":"frequent"}'::jsonb,
    '{"quick_fix":"<p>Confirm the scope, then check the device or circuit status light before touching anything.</p>","symptoms":"<p>Describe who is affected, what still works, and when it started.</p>","causes":"<ul><li></li></ul>","workarounds":"<p>What can the team do to keep working while this is diagnosed?</p>","resolutions":"<ol><li></li></ol>","escalation":"<p>Who to call, in what order, and what to hand them.</p>"}'::jsonb,
    TRUE,
    TRUE
  ),
  (
    'Application not working',
    'application-not-working',
    'An application is unavailable or will not start for one or more users.',
    '{"issue_type":"frequent"}'::jsonb,
    '{"quick_fix":"<p>What is the one thing to try first?</p>","symptoms":"<p>What does the user see? Is it everyone or just one person?</p>","causes":"<ul><li></li></ul>","workarounds":"<p>Is there a way to complete the task while this is fixed?</p>","resolutions":"<ol><li></li></ol>","escalation":"<p>Who to involve if the first line cannot resolve it?</p>"}'::jsonb,
    TRUE,
    TRUE
  ),
  (
    'Device or hardware fault',
    'device-or-hardware-fault',
    'The user''s machine, dock, headset or handset is not working properly.',
    '{"issue_type":"frequent"}'::jsonb,
    '{"quick_fix":"<p>Try a swap or a re-seat first - most of these are physical.</p>","symptoms":"<p>What exactly is the user seeing or hearing? Does it follow the device or the user?</p>","causes":"<ul><li></li></ul>","workarounds":"<p>Can the user work on a spare machine?</p>","resolutions":"<ol><li></li></ol>","escalation":"<p>Who issues the replacement?</p>"}'::jsonb,
    TRUE,
    TRUE
  )
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Curated playbooks - two per account
-- ---------------------------------------------------------------------------
INSERT INTO pb_playbooks (title, slug, description, type, status, account_id, sort_order, is_pinned)
SELECT p.title, p.slug, p.description, 'curated', 'published', a.id, p.sort_order, p.is_pinned
FROM (VALUES
  ('Northwind: Network essentials', 'nwl-network-essentials', 'The network issues that come up most often at Northwind, in the order agents hit them.', 'NWL', 1, TRUE),
  ('Northwind: New agent starter', 'nwl-new-agent-starter', 'What a new Northwind agent needs on day one, covering the tools they will use every day.', 'NWL', 2, FALSE),
  ('Crestline: Daily operations', 'crh-daily-operations', 'The everyday problems Crestline agents hit, from softphone registration to shared mailboxes.', 'CRH', 1, TRUE),
  ('Crestline: Hardware and access', 'crh-hardware-and-access', 'Device faults and access problems, in the order they usually come up.', 'CRH', 2, FALSE)
) AS p(title, slug, description, account_code, sort_order, is_pinned)
JOIN pb_accounts a ON a.code = p.account_code
WHERE NOT EXISTS (SELECT 1 FROM pb_playbooks x WHERE x.slug = p.slug);

INSERT INTO pb_playbook_sections (playbook_id, title, description, sort_order)
SELECT pb.id, v.title, v.description, v.sort_order
FROM (VALUES
  ('nwl-network-essentials', 'Get the site back online', 'The site-level outages and the first checks for them.', 1),
  ('nwl-network-essentials', 'Per-user connectivity', 'Problems that affect one agent rather than the site.', 2),
  ('nwl-new-agent-starter', 'Day one checklist', 'What to verify before an agent takes their first call.', 1),
  ('nwl-new-agent-starter', 'Everyday tools', 'The applications a Northwind agent uses all day.', 2),
  ('crh-daily-operations', 'Telephony', 'Softphone registration and call quality.', 1),
  ('crh-daily-operations', 'Mail and calendars', 'Shared mailboxes and calendar access.', 2),
  ('crh-hardware-and-access', 'Device faults', 'Hardware problems and their first checks.', 1),
  ('crh-hardware-and-access', 'Access', 'Passwords, locks and sign-in problems.', 2)
) AS v(playbook_slug, title, description, sort_order)
JOIN pb_playbooks pb ON pb.slug = v.playbook_slug
WHERE NOT EXISTS (
  SELECT 1 FROM pb_playbook_sections s WHERE s.playbook_id = pb.id AND s.title = v.title
);

INSERT INTO pb_playbook_items (playbook_id, section_id, scenario_id, sort_order)
SELECT pb.id, ps.id, s.id, v.sort_order
FROM (VALUES
  ('nwl-network-essentials', 'Get the site back online', 'internet-connectivity-drops-at-the-site', 1),
  ('nwl-network-essentials', 'Get the site back online', 'wi-fi-keeps-dropping-from-the-fifth-floor', 2),
  ('nwl-network-essentials', 'Per-user connectivity', 'vpn-will-not-connect-from-home', 1),
  ('nwl-network-essentials', 'Per-user connectivity', 'global-how-to-raise-a-p1-incident', 2),
  ('nwl-new-agent-starter', 'Day one checklist', 'global-password-reset-and-account-unlock', 1),
  ('nwl-new-agent-starter', 'Day one checklist', 'laptop-runs-out-of-disk-space-and-slows-to-a-crawl', 2),
  ('nwl-new-agent-starter', 'Everyday tools', 'cannot-sign-in-to-the-crm-password-rejected', 1),
  ('nwl-new-agent-starter', 'Everyday tools', 'vdi-session-disconnects-and-cannot-reconnect', 2),
  ('nwl-new-agent-starter', 'Everyday tools', 'docking-station-not-detecting-the-external-monitors', 3),
  ('crh-daily-operations', 'Telephony', 'softphone-will-not-register-with-the-telephony-server', 1),
  ('crh-daily-operations', 'Telephony', 'softphone-calls-drop-after-two-minutes', 2),
  ('crh-daily-operations', 'Mail and calendars', 'shared-mailbox-is-missing-messages', 1),
  ('crh-hardware-and-access', 'Device faults', 'docking-station-not-detecting-the-external-monitors', 1),
  ('crh-hardware-and-access', 'Access', 'global-password-reset-and-account-unlock', 1),
  ('crh-hardware-and-access', 'Access', 'global-recognising-a-phishing-email', 2)
) AS v(playbook_slug, section_title, scenario_slug, sort_order)
JOIN pb_playbooks pb ON pb.slug = v.playbook_slug
JOIN pb_playbook_sections ps ON ps.playbook_id = pb.id AND ps.title = v.section_title
JOIN pb_scenarios s ON s.slug = v.scenario_slug
WHERE NOT EXISTS (
  SELECT 1 FROM pb_playbook_items i
  WHERE i.playbook_id = pb.id AND i.scenario_id = s.id
);

-- ---------------------------------------------------------------------------
-- Smart playbooks
--
-- A smart playbook has no stored items: its contents are computed live from
-- the filter, so it never goes stale.
-- ---------------------------------------------------------------------------
INSERT INTO pb_playbooks (title, slug, description, type, status, account_id, smart_filter, sort_order)
SELECT
  p.title, p.slug, p.description, 'smart', 'published', a.id,
  p.smart_filter::jsonb, p.sort_order
FROM (VALUES
  (
    'All critical issues',
    'all-critical-issues',
    'Every published scenario marked critical, across all accounts. Updates itself.',
    'NWL',
    '{"severityIds":[],"accountMatch":"any"}'::text,
    3
  ),
  (
    'Frequently seen network problems',
    'frequent-network-problems',
    'Network scenarios ranked by how often they are actually hit.',
    'NWL',
    '{"categoryIds":[],"accountMatch":"any"}'::text,
    4
  )
) AS p(title, slug, description, account_code, smart_filter, sort_order)
JOIN pb_accounts a ON a.code = p.account_code
WHERE NOT EXISTS (SELECT 1 FROM pb_playbooks x WHERE x.slug = p.slug);

-- Fill the smart filters with the real option and category ids.
UPDATE pb_playbooks pb
SET smart_filter = jsonb_set(
  pb.smart_filter,
  '{severityIds}',
  COALESCE((
    SELECT jsonb_agg(o.id)
    FROM pb_criteria_options o
    JOIN pb_criteria_fields f ON f.id = o.field_id
    WHERE f.key = 'severity' AND o.value IN ('high', 'critical')
  ), '[]'::jsonb)
)
WHERE pb.slug = 'all-critical-issues';

UPDATE pb_playbooks pb
SET smart_filter = jsonb_set(
  pb.smart_filter,
  '{categoryIds}',
  COALESCE((
    SELECT jsonb_agg(c.id)
    FROM pb_categories c
    WHERE c.slug IN ('network-troubleshooting', 'wi-fi', 'internet-down', 'vpn', 'slow-connection')
  ), '[]'::jsonb)
)
WHERE pb.slug = 'frequent-network-problems';

-- ---------------------------------------------------------------------------
-- Related scenarios
-- ---------------------------------------------------------------------------
INSERT INTO pb_related_scenarios (scenario_id, related_scenario_id, relation_type)
SELECT s.id, r.id, v.relation_type
FROM (VALUES
  ('internet-connectivity-drops-at-the-site', 'wi-fi-keeps-dropping-from-the-fifth-floor', 'related'),
  ('wi-fi-keeps-dropping-from-the-fifth-floor', 'internet-connectivity-drops-at-the-site', 'related'),
  ('vpn-will-not-connect-from-home', 'wi-fi-keeps-dropping-from-the-fifth-floor', 'related'),
  ('microsoft-teams-no-audio-in-the-meeting', 'microsoft-teams-camera-not-working-in-a-meeting', 'related'),
  ('softphone-will-not-register-with-the-telephony-server', 'softphone-calls-drop-after-two-minutes', 'related'),
  ('cannot-sign-in-to-the-crm-password-rejected', 'global-password-reset-and-account-unlock', 'related'),
  ('global-password-reset-and-account-unlock', 'cannot-sign-in-to-the-crm-password-rejected', 'related'),
  ('laptop-runs-out-of-disk-space-and-slows-to-a-crawl', 'vdi-session-disconnects-and-cannot-reconnect', 'related'),
  ('outbound-email-is-rejected-by-the-recipient-server', 'global-recognising-a-phishing-email', 'related')
) AS v(slug, related_slug, relation_type)
JOIN pb_scenarios s ON s.slug = v.slug
JOIN pb_scenarios r ON r.slug = v.related_slug
WHERE NOT EXISTS (
  SELECT 1 FROM pb_related_scenarios x
  WHERE x.scenario_id = s.id AND x.related_scenario_id = r.id
);

-- ---------------------------------------------------------------------------
-- Demo engagement data
--
-- Gives the analytics dashboard something to show on a fresh install: search
-- terms (including a zero-result one), helpfulness votes and page views.
-- ---------------------------------------------------------------------------
INSERT INTO pb_search_log (user_id, query, result_count, filters)
SELECT u.id, v.query, v.result_count, v.filters::jsonb
FROM (VALUES
  ('admin@bosp.local', 'internet down', 3, '{}'),
  ('admin@bosp.local', 'softphone register', 2, '{}'),
  ('admin@bosp.local', 'vpn', 3, '{}'),
  ('admin@bosp.local', 'teams audio', 2, '{}'),
  ('admin@bosp.local', 'printer jam', 0, '{}'),
  ('admin@bosp.local', 'outlook stuck', 0, '{}')
) AS v(email, query, result_count, filters)
JOIN auth.users u ON u.email = v.email
WHERE NOT EXISTS (
  SELECT 1 FROM pb_search_log s WHERE s.query = v.query AND s.user_id = u.id
);

INSERT INTO pb_feedback (user_id, scenario_id, is_helpful, comment)
SELECT u.id, s.id, v.helpful, v.comment
FROM (VALUES
  ('admin@bosp.local', 'internet-connectivity-drops-at-the-site', TRUE, 'Saved us an hour on the last outage.'),
  ('admin@bosp.local', 'softphone-will-not-register-with-the-telephony-server', TRUE, 'The site dropdown check is the one we always miss.'),
  ('admin@bosp.local', 'wi-fi-keeps-dropping-from-the-fifth-floor', TRUE, 'The client-count step was new to us.'),
  ('admin@bosp.local', 'vpn-will-not-connect-from-home', FALSE, 'Could you add the exact router menu path?'),
  ('admin@bosp.local', 'docking-station-not-detecting-the-external-monitors', TRUE, 'Clear and correct.')
) AS v(email, slug, helpful, comment)
JOIN auth.users u ON u.email = v.email
JOIN pb_scenarios s ON s.slug = v.slug
WHERE NOT EXISTS (
  SELECT 1 FROM pb_feedback f WHERE f.scenario_id = s.id AND f.user_id = u.id
);

INSERT INTO pb_view_history (user_id, scenario_id)
SELECT u.id, s.id
FROM (VALUES
  ('admin@bosp.local', 'internet-connectivity-drops-at-the-site'),
  ('admin@bosp.local', 'microsoft-teams-no-audio-in-the-meeting'),
  ('admin@bosp.local', 'softphone-will-not-register-with-the-telephony-server'),
  ('admin@bosp.local', 'wi-fi-keeps-dropping-from-the-fifth-floor')
) AS v(email, slug)
JOIN auth.users u ON u.email = v.email
JOIN pb_scenarios s ON s.slug = v.slug
WHERE NOT EXISTS (
  SELECT 1 FROM pb_view_history h WHERE h.scenario_id = s.id AND h.user_id = u.id
);
