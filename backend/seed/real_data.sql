-- ============================================================================
-- Section 6: Load Real Big Outsource Accounts and Users
-- Excluded from git via .gitignore
-- Safe to re-run multiple times (Idempotent)
-- ============================================================================

BEGIN;

-- 1. Ensure Roles 'Admin' and 'IT Support' exist in pb_roles
INSERT INTO pb_roles (name, description, is_system, sort_order) VALUES
  ('Admin', 'Full administrative access and user management', TRUE, 1),
  ('IT Support', 'Full operational access to all playbooks, scenarios, accounts, and criteria', TRUE, 2)
ON CONFLICT (name) DO NOTHING;

-- Ensure permissions are mapped for Admin and IT Support
INSERT INTO pb_role_permissions (role_id, permission_name, allowed)
SELECT (SELECT id FROM pb_roles WHERE name = 'Admin'), p, TRUE
FROM unnest(ARRAY[
  'view_scenarios', 'create_scenarios', 'edit_own_scenario', 'edit_any_scenario',
  'publish_scenario', 'review_scenario', 'manage_criteria', 'manage_accounts',
  'manage_users', 'manage_roles', 'view_analytics', 'config_export_import'
]) AS p
ON CONFLICT DO NOTHING;

INSERT INTO pb_role_permissions (role_id, permission_name, allowed)
SELECT (SELECT id FROM pb_roles WHERE name = 'IT Support'), p, TRUE
FROM unnest(ARRAY[
  'view_scenarios', 'create_scenarios', 'edit_own_scenario', 'edit_any_scenario',
  'publish_scenario', 'review_scenario', 'manage_criteria', 'manage_accounts',
  'view_analytics', 'feedback', 'favorites'
]) AS p
ON CONFLICT DO NOTHING;

-- 2. Remove all old sample content and test data
DELETE FROM pb_favorites;
DELETE FROM pb_view_history;
DELETE FROM pb_feedback;
DELETE FROM pb_related_scenarios;
DELETE FROM pb_scenario_tokens;
DELETE FROM pb_scenario_criteria_values;
DELETE FROM pb_scenario_accounts;
DELETE FROM pb_sample_tickets;
DELETE FROM pb_playbook_items;
DELETE FROM pb_playbooks;
DELETE FROM pb_account_criteria_options;
UPDATE pb_user_profiles SET preferred_account_id = NULL;
DELETE FROM pb_user_accounts;
DELETE FROM pb_scenarios;
DELETE FROM pb_accounts;

-- Clean up old demo users
DELETE FROM auth.users WHERE email IN (
  'admin@bosp.local', 'editor@bosp.local', 'reviewer@bosp.local', 'agent@bosp.local',
  'inactive@test.local', 'admin@test.com', 'agent@test.com'
);


-- 3. Load the 26 Real Big Outsource Client Accounts
-- Colors from Big Outsource brand palette: #233B74 (Dark Blue), #288FC2 (Light Blue), #794183 (Purple), #E07E3C (Orange)
INSERT INTO pb_accounts (name, code, accent_color, description, status, is_global) VALUES
  ('Health Carousel',       'HC',   '#233B74', 'Healthcare staffing and workforce solutions', 'Active', FALSE),
  ('MyVRhost',              'MVRH', '#288FC2', 'Short-term vacation rental property management', 'Active', FALSE),
  ('Imagine Learning',      'IL',   '#794183', 'Digital-first educational curriculum platform', 'Active', FALSE),
  ('Harper Group',          'HG',   '#E07E3C', 'Publishing and lifestyle brand distribution', 'Active', FALSE),
  ('Clearabee',             'CB',   '#233B74', 'On-demand rubbish clearance and recycling services', 'Active', FALSE),
  ('DoNotPay',              'DNP',  '#288FC2', 'Consumer rights automation and legal tech', 'Active', FALSE),
  ('Feed',                  'FEED', '#794183', 'E-commerce advertising and marketplace automation', 'Active', FALSE),
  ('CelebVM',               'CVM',  '#E07E3C', 'Celebrity video messaging and fan platform', 'Active', FALSE),
  ('Priceline RevOps',      'PLRO', '#233B74', 'Travel booking revenue operations and inventory', 'Active', FALSE),
  ('Miratech',              'MIRA', '#288FC2', 'Global IT services and cloud consulting', 'Active', FALSE),
  ('US Legal Support',      'USLS', '#794183', 'Litigation support and record retrieval services', 'Active', FALSE),
  ('Driveline Baseball',    'DLB',  '#E07E3C', 'Data-driven baseball performance training', 'Active', FALSE),
  ('Cohley',                'CHLY', '#233B74', 'Digital asset and user-generated content generation', 'Active', FALSE),
  ('Fat Pizza',             'FPZ',  '#288FC2', 'Quick service restaurant ordering and logistics', 'Active', FALSE),
  ('Under the Doormat',     'UTD',  '#794183', 'Luxury urban short-stay property management', 'Active', FALSE),
  ('Medex',                 'MDX',  '#E07E3C', 'Emergency medical supply distribution', 'Active', FALSE),
  ('Lem Garcia Law',        'LGL',  '#233B74', 'Personal injury and civil legal practice', 'Active', FALSE),
  ('Freedom and Glory',     'FAG',  '#288FC2', 'Lifestyle apparel and brand operations', 'Active', FALSE),
  ('InMotion',              'INM',  '#794183', 'Web hosting and managed infrastructure services', 'Active', FALSE),
  ('Travers',               'TRV',  '#E07E3C', 'Industrial metalworking and supply distribution', 'Active', FALSE),
  ('Essentials in Writing', 'EIW',  '#233B74', 'Homeschooling video curriculum and grading services', 'Active', FALSE),
  ('Cipher Billing',        'CPHB', '#288FC2', 'Medical billing and revenue cycle management', 'Active', FALSE),
  ('IFA',                   'IFA',  '#794183', 'Agricultural cooperative supply and agronomy services', 'Active', FALSE),
  ('Skanwear',              'SKW',  '#E07E3C', 'Arc flash protection and specialist workwear', 'Active', FALSE),
  ('MyCali PT',             'MCPT', '#233B74', 'Outpatient physical therapy clinic network', 'Active', FALSE),
  ('Kiddom',                'KDM',  '#288FC2', 'K-12 digital curriculum and assessment suite', 'Active', FALSE)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  accent_color = EXCLUDED.accent_color,
  description = EXCLUDED.description,
  status = 'Active';

-- 4. Load the 8 Real Users into auth.users and pb_user_profiles
-- Initial password is set to standard setup credentials matching DEMO_USER_PASSWORD for initial MFA setup
CREATE OR REPLACE FUNCTION temp_create_real_user(
  p_email TEXT,
  p_name TEXT,
  p_role TEXT
) RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_role_id UUID;
BEGIN
  -- Check if user already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new,
      email_change_token_current, email_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      p_email,
      crypt('hbkPmen_KuZ~JjwV4ZqB', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', p_name),
      'authenticated',
      'authenticated',
      now(),
      now(),
      '', '', '', '', '', '', ''
    );
  END IF;

  -- Create or update profile
  INSERT INTO pb_user_profiles (id, email, display_name, role, is_active)
  VALUES (v_user_id, p_email, p_name, p_role, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    is_active = TRUE;

  -- Map role in pb_user_roles
  SELECT id INTO v_role_id FROM pb_roles WHERE name = p_role;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO pb_user_roles (user_id, role_id)
    VALUES (v_user_id, v_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  -- Grant access to all 26 accounts
  INSERT INTO pb_user_accounts (user_id, account_id)
  SELECT v_user_id, a.id FROM pb_accounts a
  ON CONFLICT (user_id, account_id) DO NOTHING;

END;
$$ LANGUAGE plpgsql;

-- Execute for all 8 staff members
SELECT temp_create_real_user('aldrin.brucal@bigoutsource.com',  'Aldrin Brucal',    'IT Support');
SELECT temp_create_real_user('ronald.balza@bigoutsource.com',   'Ronald Balza',     'Admin');
SELECT temp_create_real_user('karla.espiritu@bigoutsource.com', 'Karla Espiritu',   'IT Support');
SELECT temp_create_real_user('paolo.pizana@bigoutsource.com',   'Paolo Pizana',     'IT Support');
SELECT temp_create_real_user('frkatigbak@bigoutsource.ph',      'Francis Katigbak', 'IT Support');
SELECT temp_create_real_user('paulreinier.vista@bigoutsource.com', 'Reinier Vista', 'Admin');
SELECT temp_create_real_user('lyaragoza@bigoutsource.ph',       'Lee An Aragoza',   'IT Support');
SELECT temp_create_real_user('wfbibon@bigoutsource.ph',         'Wesley Bibon',     'IT Support');

DROP FUNCTION temp_create_real_user(TEXT, TEXT, TEXT);

COMMIT;
