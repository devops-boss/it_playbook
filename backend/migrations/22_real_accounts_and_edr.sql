-- ============================================================================
-- Migration 22: Real Accounts (26 Big Outsource Clients), EDR & ESET, App Name
-- ============================================================================

BEGIN;

-- 1. Ensure all 26 Real Big Outsource Client Accounts exist and are Active
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

-- 2. Map all users to all 26 accounts in pb_user_accounts
INSERT INTO pb_user_accounts (user_id, account_id)
SELECT u.id, a.id
FROM pb_user_profiles u
CROSS JOIN pb_accounts a
ON CONFLICT (user_id, account_id) DO NOTHING;

-- 3. Category: EDR (Endpoint Detection & Response) and Sub-Category ESET
INSERT INTO pb_categories (name, slug, parent_id, icon, color, sort_order, is_active)
VALUES ('EDR', 'edr', NULL, 'shield-check', '#e11d48', 8, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = 'EDR',
  icon = 'shield-check',
  color = '#e11d48',
  is_active = TRUE;

INSERT INTO pb_categories (name, slug, parent_id, icon, color, sort_order, is_active)
SELECT 'ESET', 'eset', c.id, 'shield', '#06b6d4', 1, TRUE
FROM pb_categories c
WHERE c.slug = 'edr'
ON CONFLICT (slug) DO UPDATE SET
  name = 'ESET',
  parent_id = (SELECT id FROM pb_categories WHERE slug = 'edr'),
  icon = 'shield',
  color = '#06b6d4',
  is_active = TRUE;

-- 4. Criteria Platform/Tool: Add ESET option
INSERT INTO pb_criteria_options (field_id, label, value, color, sort_order, is_active)
SELECT cf.id, 'ESET', 'eset', '#06b6d4', 8, TRUE
FROM pb_criteria_fields cf
WHERE cf.key = 'platform'
  AND NOT EXISTS (
    SELECT 1 FROM pb_criteria_options opt
    WHERE opt.field_id = cf.id AND (opt.value = 'eset' OR opt.label = 'ESET')
  );

-- 5. Update pb_settings app_name to 'IT Operations Playbook'
UPDATE pb_settings
SET settings = jsonb_set(settings, '{app_name}', '"IT Operations Playbook"')
WHERE scope = 'global';

COMMIT;

