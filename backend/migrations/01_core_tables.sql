-- ============================================================================
-- BOS Playbook - Core Tables Migrations
-- ============================================================================

-- Required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ============================================================================
-- pb_accounts - Accounts with branding, status, and settings
-- ============================================================================
CREATE TABLE pb_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  accent_color TEXT DEFAULT '#0066CC',
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Onboarding','Offboarding','Archived')),
  is_global BOOLEAN NOT NULL DEFAULT FALSE,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_accounts_is_global ON pb_accounts(is_global);
CREATE INDEX idx_pb_accounts_status ON pb_accounts(status);

-- ============================================================================
-- pb_roles - Roles (system defaults + admin-created custom roles)
-- ============================================================================
CREATE TABLE pb_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO pb_roles (name, description, is_system, sort_order) VALUES
  ('Super Admin', 'Full access to all features and configuration', TRUE, 1),
  ('IT Ops Editor', 'Creates/edits scenarios, flowcharts, playbooks for assigned accounts', TRUE, 2),
  ('Reviewer', 'Approves scenarios and playbooks before publishing', TRUE, 3),
  ('IT Agent', 'Searches, reads, provides feedback and favorites', TRUE, 4)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- pb_user_profiles - Extended user info (must come after pb_roles)
-- ============================================================================
CREATE TABLE pb_user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  photo_url TEXT,
  preferred_account_id UUID REFERENCES pb_accounts(id),
  settings JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- pb_role_permissions - Permission matrix
-- Note: `allowed` on the role/permission pair. `account_id` scopes a
-- permission to a single account (NULL = applies to all accounts).
-- ============================================================================
CREATE TABLE pb_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID REFERENCES pb_roles(id) ON DELETE CASCADE,
  permission_name TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT FALSE,
  account_id UUID REFERENCES pb_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_pb_role_permissions ON pb_role_permissions(role_id, permission_name, account_id)
  WHERE account_id IS NULL;
CREATE UNIQUE INDEX uq_pb_role_permissions_acct ON pb_role_permissions(role_id, permission_name, account_id)
  WHERE account_id IS NOT NULL;

-- Default permissions for system roles
INSERT INTO pb_role_permissions (role_id, permission_name, allowed) VALUES
  ((SELECT id FROM pb_roles WHERE name = 'Super Admin'), 'view_scenarios', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Super Admin'), 'create_scenarios', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Super Admin'), 'edit_own_scenario', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Super Admin'), 'edit_any_scenario', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Super Admin'), 'publish_scenario', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Super Admin'), 'review_scenario', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Super Admin'), 'manage_criteria', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Super Admin'), 'manage_accounts', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Super Admin'), 'manage_users', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Super Admin'), 'manage_roles', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Super Admin'), 'view_analytics', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Super Admin'), 'config_export_import', TRUE),

  ((SELECT id FROM pb_roles WHERE name = 'IT Ops Editor'), 'view_scenarios', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'IT Ops Editor'), 'create_scenarios', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'IT Ops Editor'), 'edit_own_scenario', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'IT Ops Editor'), 'edit_any_scenario', FALSE),
  ((SELECT id FROM pb_roles WHERE name = 'IT Ops Editor'), 'publish_scenario', FALSE),
  ((SELECT id FROM pb_roles WHERE name = 'IT Ops Editor'), 'review_scenario', FALSE),
  ((SELECT id FROM pb_roles WHERE name = 'IT Ops Editor'), 'manage_criteria', FALSE),
  ((SELECT id FROM pb_roles WHERE name = 'IT Ops Editor'), 'view_analytics', TRUE),

  ((SELECT id FROM pb_roles WHERE name = 'Reviewer'), 'view_scenarios', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Reviewer'), 'publish_scenario', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Reviewer'), 'review_scenario', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'Reviewer'), 'view_analytics', TRUE),

  ((SELECT id FROM pb_roles WHERE name = 'IT Agent'), 'view_scenarios', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'IT Agent'), 'feedback', TRUE),
  ((SELECT id FROM pb_roles WHERE name = 'IT Agent'), 'favorites', TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- pb_user_roles - User-to-role assignment
-- ============================================================================
CREATE TABLE pb_user_roles (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES pb_roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- ============================================================================
-- pb_user_accounts - Per-user account access
-- ============================================================================
CREATE TABLE pb_user_accounts (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES pb_accounts(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id)
);

CREATE INDEX idx_pb_user_accounts_account ON pb_user_accounts(account_id);
