-- ============================================================================
-- BOS Playbook - Configuration/Definition Tables
-- ============================================================================

-- ============================================================================
-- pb_categories - Hierarchical category tree (Problem Categories)
-- ============================================================================
CREATE TABLE pb_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES pb_categories(id),
  icon TEXT,
  color TEXT DEFAULT '#3b82f6',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_global BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for hierarchical queries
CREATE INDEX idx_pb_categories_parent ON pb_categories(parent_id);
CREATE INDEX idx_pb_categories_sort ON pb_categories(sort_order);
CREATE INDEX idx_pb_categories_active ON pb_categories(is_active);

-- ============================================================================
-- pb_criteria_fields - Custom criteria field definitions
-- ============================================================================
CREATE TABLE pb_criteria_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('single-select','multi-select','hierarchical-select','text','number','date','yes-no')),
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','account')),
  applies_to TEXT NOT NULL DEFAULT 'both' CHECK (applies_to IN ('scenarios','playbooks','both')),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  required_condition JSONB, -- e.g., {"if": [{"field_key":"category","value":"network"}]}
  show_as_facet BOOLEAN NOT NULL DEFAULT TRUE,
  show_on_card BOOLEAN NOT NULL DEFAULT TRUE,
  default_value JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for field lookup and filtering
CREATE INDEX idx_pb_criteria_fields_key ON pb_criteria_fields(key);
CREATE INDEX idx_pb_criteria_fields_active ON pb_criteria_fields(is_active);
CREATE INDEX idx_pb_criteria_fields_type ON pb_criteria_fields(type);

-- ============================================================================
-- pb_criteria_options - Options for select-type criteria fields
-- ============================================================================
CREATE TABLE pb_criteria_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES pb_criteria_fields(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  parent_id UUID REFERENCES pb_criteria_options(id), -- For hierarchical select
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for options lookup
CREATE INDEX idx_pb_criteria_options_field ON pb_criteria_options(field_id);
CREATE INDEX idx_pb_criteria_options_parent ON pb_criteria_options(parent_id);

-- ============================================================================
-- pb_account_criteria_options - Per-account enablement of criteria options
-- ============================================================================
CREATE TABLE pb_account_criteria_options (
  account_id UUID REFERENCES pb_accounts(id) ON DELETE CASCADE,
  field_id UUID REFERENCES pb_criteria_fields(id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, field_id)
);

CREATE INDEX idx_pb_account_criteria_opts_account ON pb_account_criteria_options(account_id);
CREATE INDEX idx_pb_account_criteria_opts_field ON pb_account_criteria_options(field_id);

-- ============================================================================
-- pb_section_definitions - Configurable scenario sections
-- ============================================================================
CREATE TABLE pb_section_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  applies_to TEXT NOT NULL DEFAULT 'scenarios' CHECK (applies_to IN ('scenarios','playbooks','both')),
  help_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default sections
INSERT INTO pb_section_definitions (name, key, label, sort_order, is_required, help_text) VALUES
  ('header', 'header', 'Header', 1, FALSE, 'Title, criteria chips, status, tags, author, last updated'),
  ('quick_fix', 'quick_fix', 'Quick Fix', 2, FALSE, 'Fastest workaround, highlighted at the top'),
  ('symptoms', 'symptoms', 'Problem Description / Symptoms', 3, TRUE, 'Rich text description of the problem'),
  ('flowchart', 'flowchart', 'Troubleshooting Flowchart', 4, FALSE, 'Visual drag-and-drop editor'),
  ('sample_tickets', 'sample_tickets', 'Sample Tickets', 5, FALSE, 'Historical tickets demonstrating the issue'),
  ('causes', 'causes', 'Possible Causes', 6, FALSE, 'List of potential root causes'),
  ('workarounds', 'workarounds', 'Workarounds', 7, FALSE, 'Temporary solutions'),
  ('resolutions', 'resolutions', 'Resolutions', 8, FALSE, 'Permanent fixes'),
  ('escalation', 'escalation', 'Escalation Path', 9, FALSE, 'When to escalate and to whom'),
  ('attachments', 'attachments', 'Attachments', 10, FALSE, 'Related files'),
  ('related', 'related', 'Related Scenarios', 11, FALSE, 'Links to related playbooks')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- pb_templates - Scenario templates with prefilled content
-- ============================================================================
CREATE TABLE pb_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  criteria_defaults JSONB,
  sections_content JSONB, -- Default section content templates
  flowchart_template JSONB, -- Default flowchart structure
  is_global BOOLEAN NOT NULL DEFAULT FALSE,
  account_id UUID REFERENCES pb_accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_templates_key ON pb_templates(key);
CREATE INDEX idx_pb_templates_global ON pb_templates(is_global);
CREATE INDEX idx_pb_templates_account ON pb_templates(account_id);

-- ============================================================================
-- pb_node_types - Configurable flowchart node types
-- ============================================================================
CREATE TABLE pb_node_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  icon TEXT,
  color TEXT DEFAULT '#64748b',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default node types
INSERT INTO pb_node_types (key, label, icon, color, sort_order) VALUES
  ('start', 'Start', 'play', '#10b981', 1),
  ('action', 'Action', 'settings', '#3b82f6', 2),
  ('decision', 'Decision', 'help-circle', '#f59e0b', 3),
  ('workaround', 'Workaround', 'alert-triangle', '#f97316', 4),
  ('resolution', 'Resolution', 'check-circle', '#22c55e', 5),
  ('escalate', 'Escalate', 'arrow-up-right', '#ef4444', 6),
  ('end', 'End', 'square', '#64748b', 7)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- pb_outcomes - Sample ticket outcomes
-- ============================================================================
CREATE TABLE pb_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  value TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#64748b',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default outcomes
INSERT INTO pb_outcomes (label, value, color, sort_order) VALUES
  ('Resolved', 'resolved', '#22c55e', 1),
  ('Workaround Applied', 'workaround', '#f59e0b', 2),
  ('Escalated', 'escalated', '#ef4444', 3),
  ('Reopened', 'reopened', '#3b82f6', 4),
  ('No Action Needed', 'no_action', '#9ca3af', 5)
ON CONFLICT (value) DO NOTHING;

-- ============================================================================
-- pb_settings - Global and per-account application settings
-- ============================================================================
CREATE TABLE pb_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','account')),
  account_id UUID REFERENCES pb_accounts(id),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scope, account_id)
);

CREATE INDEX idx_pb_settings_scope ON pb_settings(scope);
CREATE INDEX idx_pb_settings_account ON pb_settings(account_id);

-- Default global settings
INSERT INTO pb_settings (scope, settings) VALUES ('global', '{
  "app_name": "BOS Playbook",
  "app_logo": "/logo.png",
  "accent_color": "#0066CC",
  "default_theme": "light",
  "stale_threshold_days": 180,
  "announcement_banner": null,
  "search_synonyms": {
    "wifi": ["wi-fi", "wireless", "internet"],
    "teams": ["microsoft teams", "msteams"],
    "vpn": ["virtual private network"]
  },
  "pinned_items_count": 10,
  "upload_types": ["image/*", "application/pdf", "text/plain"],
  "upload_max_size": 10485760
}'::jsonb) ON CONFLICT DO NOTHING;

-- ============================================================================
-- pb_synonyms - Full-text search synonyms
-- ============================================================================
CREATE TABLE pb_synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL UNIQUE,
  alternatives TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_synonyms_term ON pb_synonyms(term);

-- Default synonyms for common BPO terms
INSERT INTO pb_synonyms (term, alternatives) VALUES
  ('wifi', ARRAY['wi-fi','wireless','internet','wireless internet','wifi issues','no internet'])
ON CONFLICT (term) DO NOTHING;

-- ============================================================================
-- pb_tags - System-wide tags for categorization
-- ============================================================================
CREATE TABLE pb_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#64748b',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- pb_outcomes - Ticket outcome values (moved from earlier)
-- ============================================================================
-- Already created above