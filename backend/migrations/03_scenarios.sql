-- ============================================================================
-- BOS Playbook - Scenario Content Tables
-- ============================================================================

-- ============================================================================
-- pb_scenarios - Core scenario entity
-- ============================================================================
CREATE TABLE pb_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','published','archived')),
  is_global BOOLEAN NOT NULL DEFAULT FALSE,

  -- System criteria (indexed columns for performance)
  account_id UUID REFERENCES pb_accounts(id), -- Primary account (may be null if global)
  category_id UUID REFERENCES pb_categories(id),
  issue_type_id UUID REFERENCES pb_criteria_options(id),
  severity_id UUID REFERENCES pb_criteria_options(id),
  impact_scope_id UUID REFERENCES pb_criteria_options(id),

  -- Content sections
  quick_fix TEXT,
  symptoms TEXT, -- Rich text (JSONB or HTML)
  causes TEXT, -- JSONB array of cause objects
  workarounds TEXT, -- JSONB array of workaround objects
  resolutions TEXT, -- JSONB array of resolution step objects
  escalation TEXT, -- JSONB escalation path
  prevention TEXT, -- Rich text prevention notes
  custom_sections JSONB DEFAULT '{}'::jsonb, -- Admin-defined custom sections

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  occurrence_count INTEGER NOT NULL DEFAULT 0,
  last_occurred_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_at TIMESTAMPTZ,

  -- Search
  search_vector TSVECTOR,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ, -- Soft delete
  published_at TIMESTAMPTZ
);

-- Indexes for filtering
CREATE INDEX idx_pb_scenarios_status ON pb_scenarios(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_pb_scenarios_account ON pb_scenarios(account_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pb_scenarios_category ON pb_scenarios(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pb_scenarios_issue_type ON pb_scenarios(issue_type_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pb_scenarios_severity ON pb_scenarios(severity_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pb_scenarios_impact ON pb_scenarios(impact_scope_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pb_scenarios_global ON pb_scenarios(is_global) WHERE deleted_at IS NULL;
CREATE INDEX idx_pb_scenarios_occurrence ON pb_scenarios(occurrence_count DESC);
CREATE INDEX idx_pb_scenarios_updated ON pb_scenarios(updated_at DESC);
CREATE INDEX idx_pb_scenarios_pinned ON pb_scenarios(is_pinned) WHERE is_pinned = TRUE;

-- GIN index for full-text search
CREATE INDEX idx_pb_scenarios_search ON pb_scenarios USING GIN(search_vector);
-- GIN index for tags
CREATE INDEX idx_pb_scenarios_tags ON pb_scenarios USING GIN(tags);
-- GIN index for custom sections
CREATE INDEX idx_pb_scenarios_custom_sections ON pb_scenarios USING GIN(custom_sections jsonb_path_ops);
-- Trigram indexes for typo-tolerant title matching ("intrenet" -> "internet")
CREATE INDEX idx_pb_scenarios_title_trgm ON pb_scenarios USING GIN(title gin_trgm_ops);
CREATE INDEX idx_pb_scenarios_summary_trgm ON pb_scenarios USING GIN(summary gin_trgm_ops);

-- ============================================================================
-- pb_scenario_accounts - Multi-account link (for scenarios affecting multiple accounts)
-- ============================================================================
CREATE TABLE pb_scenario_accounts (
  scenario_id UUID REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  account_id UUID REFERENCES pb_accounts(id),
  PRIMARY KEY (scenario_id, account_id)
);

CREATE INDEX idx_pb_scenario_accounts_account ON pb_scenario_accounts(account_id);

-- ============================================================================
-- pb_scenario_criteria_values - EAV store for custom criteria
-- ============================================================================
-- Surrogate PK: value columns must stay nullable because each field type
-- populates a different one. Uniqueness is enforced with partial unique
-- indexes below (one per value shape) rather than a composite PK.
CREATE TABLE pb_scenario_criteria_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  field_id UUID REFERENCES pb_criteria_fields(id) ON DELETE CASCADE,
  option_id UUID REFERENCES pb_criteria_options(id) ON DELETE CASCADE, -- For select types
  value_text TEXT, -- For text type
  value_number NUMERIC, -- For number type
  value_date DATE, -- For date type
  value_bool BOOLEAN, -- For yes-no type
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (scenario, field, option) for select/multi-select
CREATE UNIQUE INDEX uq_pb_scenario_criteria_option
  ON pb_scenario_criteria_values(scenario_id, field_id, option_id)
  WHERE option_id IS NOT NULL;
-- One row per (scenario, field, text value)
CREATE UNIQUE INDEX uq_pb_scenario_criteria_text
  ON pb_scenario_criteria_values(scenario_id, field_id, value_text)
  WHERE value_text IS NOT NULL;
-- One row per (scenario, field) for scalar types
CREATE UNIQUE INDEX uq_pb_scenario_criteria_number
  ON pb_scenario_criteria_values(scenario_id, field_id)
  WHERE value_number IS NOT NULL;
CREATE UNIQUE INDEX uq_pb_scenario_criteria_date
  ON pb_scenario_criteria_values(scenario_id, field_id)
  WHERE value_date IS NOT NULL;
CREATE UNIQUE INDEX uq_pb_scenario_criteria_bool
  ON pb_scenario_criteria_values(scenario_id, field_id)
  WHERE value_bool IS NOT NULL;

-- Indexes for fast facet counting and filtering
CREATE INDEX idx_pb_scenario_criteria_field_option ON pb_scenario_criteria_values(field_id, option_id, scenario_id);
CREATE INDEX idx_pb_scenario_criteria_scenario ON pb_scenario_criteria_values(scenario_id, field_id);
CREATE INDEX idx_pb_scenario_criteria_text ON pb_scenario_criteria_values(field_id) WHERE value_text IS NOT NULL;
CREATE INDEX idx_pb_scenario_criteria_number ON pb_scenario_criteria_values(field_id) WHERE value_number IS NOT NULL;
CREATE INDEX idx_pb_scenario_criteria_date ON pb_scenario_criteria_values(field_id) WHERE value_date IS NOT NULL;
CREATE INDEX idx_pb_scenario_criteria_bool ON pb_scenario_criteria_values(field_id) WHERE value_bool IS NOT NULL;

-- ============================================================================
-- pb_flowcharts - Flowchart data (nodes/edges as JSONB)
-- ============================================================================
CREATE TABLE pb_flowcharts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID UNIQUE REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  viewport JSONB DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- pb_sample_tickets - Historical tickets
-- ============================================================================
CREATE TABLE pb_sample_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  ticket_id TEXT NOT NULL,
  ticket_date DATE,
  reporter TEXT,
  site TEXT,
  problem_reported TEXT,
  observed TEXT,
  action_taken TEXT,
  outcome_id UUID REFERENCES pb_outcomes(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_sample_tickets_scenario ON pb_sample_tickets(scenario_id);
CREATE INDEX idx_pb_sample_tickets_ticket_id ON pb_sample_tickets(ticket_id);
CREATE INDEX idx_pb_sample_tickets_date ON pb_sample_tickets(ticket_date);
-- Trigram index on ticket IDs so "TKT-900" finds "TKT-9001"
CREATE INDEX idx_pb_sample_tickets_id_trgm ON pb_sample_tickets USING GIN(ticket_id gin_trgm_ops);

-- ============================================================================
-- pb_attachments - File metadata (actual files in Supabase Storage)
-- ============================================================================
CREATE TABLE pb_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  section_key TEXT, -- Which section this attachment belongs to
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Storage path
  file_size BIGINT,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pb_attachments_scenario ON pb_attachments(scenario_id);

-- ============================================================================
-- pb_related_scenarios - Many-to-many related scenarios
-- ============================================================================
CREATE TABLE pb_related_scenarios (
  scenario_id UUID REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  related_scenario_id UUID REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  relation_type TEXT DEFAULT 'related',
  PRIMARY KEY (scenario_id, related_scenario_id)
);

-- ============================================================================
-- pb_versions - Version history for scenarios
-- ============================================================================
CREATE TABLE pb_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  change_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scenario_id, version_number)
);

CREATE INDEX idx_pb_versions_scenario ON pb_versions(scenario_id, version_number DESC);