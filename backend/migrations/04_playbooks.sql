-- ============================================================================
-- BOS Playbook - Playbooks, User Data, Analytics Tables
-- ============================================================================

-- ============================================================================
-- pb_playbooks - Curated and Smart playbooks
-- ============================================================================
CREATE TABLE pb_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('curated','smart')),
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','published','archived')),
  account_id UUID REFERENCES pb_accounts(id),
  category_id UUID REFERENCES pb_categories(id),

  -- Smart playbook filter (JSONB criteria filter)
  smart_filter JSONB,

  -- Criteria for playbooks (EAV, same structure as scenarios)
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_at TIMESTAMPTZ,

  -- Metadata
  occurrence_count INTEGER NOT NULL DEFAULT 0,
  last_occurred_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,

  -- Search
  search_vector TSVECTOR,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ
);

CREATE INDEX idx_pb_playbooks_type ON pb_playbooks(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_pb_playbooks_status ON pb_playbooks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_pb_playbooks_account ON pb_playbooks(account_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pb_playbooks_category ON pb_playbooks(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pb_playbooks_pinned ON pb_playbooks(is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX idx_pb_playbooks_search ON pb_playbooks USING GIN(search_vector);

-- ============================================================================
-- pb_playbook_sections - Chapters/sections in curated playbooks
-- (created before pb_playbook_items, which references it)
-- ============================================================================
CREATE TABLE pb_playbook_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID REFERENCES pb_playbooks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_playbook_sections_playbook ON pb_playbook_sections(playbook_id, sort_order);

-- ============================================================================
-- pb_playbook_items - Ordered scenario references in curated playbooks
-- ============================================================================
CREATE TABLE pb_playbook_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID REFERENCES pb_playbooks(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  section_id UUID REFERENCES pb_playbook_sections(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_playbook_items_playbook ON pb_playbook_items(playbook_id, sort_order);
CREATE INDEX idx_pb_playbook_items_scenario ON pb_playbook_items(scenario_id);

-- ============================================================================
-- pb_playbook_criteria_values - EAV for playbook custom criteria
-- ============================================================================
CREATE TABLE pb_playbook_criteria_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID REFERENCES pb_playbooks(id) ON DELETE CASCADE,
  field_id UUID REFERENCES pb_criteria_fields(id) ON DELETE CASCADE,
  option_id UUID REFERENCES pb_criteria_options(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number NUMERIC,
  value_date DATE,
  value_bool BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_pb_playbook_criteria_option
  ON pb_playbook_criteria_values(playbook_id, field_id, option_id)
  WHERE option_id IS NOT NULL;
CREATE UNIQUE INDEX uq_pb_playbook_criteria_text
  ON pb_playbook_criteria_values(playbook_id, field_id, value_text)
  WHERE value_text IS NOT NULL;
CREATE UNIQUE INDEX uq_pb_playbook_criteria_scalar
  ON pb_playbook_criteria_values(playbook_id, field_id)
  WHERE value_number IS NOT NULL OR value_date IS NOT NULL OR value_bool IS NOT NULL;

CREATE INDEX idx_pb_playbook_criteria_field_option ON pb_playbook_criteria_values(field_id, option_id, playbook_id);

-- ============================================================================
-- pb_favorites - User favorites
-- ============================================================================
CREATE TABLE pb_favorites (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scenario_id)
);

-- ============================================================================
-- pb_feedback - Helpful/not helpful feedback
-- ============================================================================
CREATE TABLE pb_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  is_helpful BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_feedback_scenario ON pb_feedback(scenario_id);
CREATE INDEX idx_pb_feedback_user ON pb_feedback(user_id);

-- ============================================================================
-- pb_view_history - Recently viewed scenarios
-- ============================================================================
CREATE TABLE pb_view_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_view_history_user ON pb_view_history(user_id, viewed_at DESC);
CREATE INDEX idx_pb_view_history_scenario ON pb_view_history(scenario_id);

-- ============================================================================
-- pb_playbook_progress - User progress tracking on playbooks
-- ============================================================================
CREATE TABLE pb_playbook_progress (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  playbook_id UUID REFERENCES pb_playbooks(id) ON DELETE CASCADE,
  completed_items TEXT[] DEFAULT '{}', -- Array of completed scenario IDs
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, playbook_id)
);

-- ============================================================================
-- pb_search_log - Search analytics
-- ============================================================================
CREATE TABLE pb_search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  filters JSONB,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_search_log_query ON pb_search_log(query);
CREATE INDEX idx_pb_search_log_time ON pb_search_log(searched_at DESC);
CREATE INDEX idx_pb_search_log_zero ON pb_search_log(result_count) WHERE result_count = 0;

-- ============================================================================
-- pb_audit_log - General audit trail
-- ============================================================================
CREATE TABLE pb_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- create, update, delete, publish, archive, etc.
  entity_type TEXT NOT NULL, -- scenario, account, criteria_field, etc.
  entity_id UUID,
  changes JSONB, -- {before: ..., after: ...}
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_audit_log_entity ON pb_audit_log(entity_type, entity_id);
CREATE INDEX idx_pb_audit_log_user ON pb_audit_log(user_id);
CREATE INDEX idx_pb_audit_log_time ON pb_audit_log(created_at DESC);

-- ============================================================================
-- pb_config_history - Configuration change history
-- ============================================================================
CREATE TABLE pb_config_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  config_type TEXT NOT NULL, -- criteria_field, criteria_option, category, template, setting, etc.
  config_id UUID,
  action TEXT NOT NULL, -- create, update, delete, merge, deactivate
  before_value JSONB,
  after_value JSONB,
  impact_summary TEXT, -- Human-readable impact preview
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_config_history_type ON pb_config_history(config_type);
CREATE INDEX idx_pb_config_history_time ON pb_config_history(created_at DESC);

-- ============================================================================
-- pb_saved_views - Personal saved filter views
-- ============================================================================
CREATE TABLE pb_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_saved_views_user ON pb_saved_views(user_id);