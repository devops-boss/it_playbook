/**
 * Database types for BOS Playbook.
 *
 * Mirrors the `pb_` schema defined in backend/migrations. The application
 * treats criteria definitions as DATA (see `CriteriaField`), so adding a
 * custom field in the admin UI requires no change to this file.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ScenarioStatus = 'draft' | 'pending_review' | 'published' | 'archived';
export type AccountStatus = 'Active' | 'Onboarding' | 'Offboarding' | 'Archived';
export type PlaybookType = 'curated' | 'smart';
export type AccountMatchMode = 'any' | 'all' | 'only';

/** Field types the Criteria Builder can create. */
export type CriteriaFieldType =
  | 'single-select'
  | 'multi-select'
  | 'hierarchical-select'
  | 'text'
  | 'number'
  | 'date'
  | 'yes-no';

export type CriteriaScope = 'global' | 'account';
export type AppliesTo = 'scenarios' | 'playbooks' | 'both';

export interface Account {
  id: string;
  name: string;
  code: string;
  description: string | null;
  logo_url: string | null;
  accent_color: string | null;
  status: AccountStatus;
  is_global: boolean;
  settings: Json;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  display_name: string | null;
  photo_url: string | null;
  preferred_account_id: string | null;
  settings: Json;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  sort_order: number;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_name: string;
  allowed: boolean;
  account_id: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  is_global: boolean;
  created_at: string;
  updated_at: string;
}

/** A criteria field definition. System fields can be renamed but not deleted. */
export interface CriteriaField {
  id: string;
  key: string;
  label: string;
  description: string | null;
  type: CriteriaFieldType;
  scope: CriteriaScope;
  applies_to: AppliesTo;
  is_required: boolean;
  required_condition: Json | null;
  show_as_facet: boolean;
  show_on_card: boolean;
  default_value: Json | null;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
}

export interface CriteriaOption {
  id: string;
  field_id: string;
  label: string;
  value: string;
  parent_id: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface SectionDefinition {
  id: string;
  name: string;
  key: string;
  label: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
  applies_to: AppliesTo;
  help_text: string | null;
}

export interface ScenarioTemplate {
  id: string;
  name: string;
  key: string;
  description: string | null;
  criteria_defaults: Json | null;
  sections_content: Json | null;
  flowchart_template: Json | null;
  is_global: boolean;
  account_id: string | null;
  is_active: boolean;
  created_by: string | null;
}

export interface NodeType {
  id: string;
  key: string;
  label: string;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface Outcome {
  id: string;
  label: string;
  value: string;
  color: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface AppSettings {
  id?: string;
  scope: 'global' | 'account';
  account_id: string | null;
  settings: {
    app_name?: string;
    app_logo?: string;
    accent_color?: string;
    default_theme?: 'light' | 'dark' | 'system';
    stale_threshold_days?: number;
    announcement_banner?: string | null;
    search_synonyms?: Record<string, string[]>;
    pinned_items_count?: number;
    upload_types?: string[];
    upload_max_size?: number;
    [key: string]: Json | undefined;
  };
  updated_at?: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Synonym {
  id: string;
  term: string;
  alternatives: string[];
}

/** The scenario row. `search_vector` is maintained by a DB trigger. */
export interface Scenario {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: ScenarioStatus;
  is_global: boolean;
  account_id: string | null;
  category_id: string | null;
  issue_type_id: string | null;
  severity_id: string | null;
  impact_scope_id: string | null;
  quick_fix: string | null;
  symptoms: string | null;
  causes: string | null;
  workarounds: string | null;
  resolutions: string | null;
  escalation: string | null;
  prevention: string | null;
  custom_sections: Json;
  tags: string[];
  occurrence_count: number;
  last_occurred_at: string | null;
  version: number;
  is_pinned: boolean;
  pinned_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  published_at: string | null;
}

export interface ScenarioAccount {
  scenario_id: string;
  account_id: string;
}

export interface ScenarioCriteriaValue {
  id?: string;
  scenario_id: string;
  field_id: string;
  option_id: string | null;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_bool: boolean | null;
}

/** A React Flow node/edge graph persisted as JSONB. */
export interface FlowchartData {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    nodeType: string;
    description?: string;
    imageUrl?: string;
    scenarioLink?: string;
    isYesBranch?: boolean;
    /** Kept in the data as well as in the style: React Flow 11 does not
     *  pass the node style down to the node component. */
    borderColor?: string;
    backgroundColor?: string;
  };
  style?: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: { branch?: 'yes' | 'no' };
}

export interface SampleTicket {
  id: string;
  scenario_id: string;
  ticket_id: string;
  ticket_date: string | null;
  reporter: string | null;
  site: string | null;
  problem_reported: string | null;
  observed: string | null;
  action_taken: string | null;
  outcome_id: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  scenario_id: string;
  section_key: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
  signed_url?: string | null;
}

export interface Playbook {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  type: PlaybookType;
  cover_image_url: string | null;
  status: ScenarioStatus;
  account_id: string | null;
  category_id: string | null;
  smart_filter: Json | null;
  sort_order: number;
  is_pinned: boolean;
  pinned_at: string | null;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface PlaybookSection {
  id: string;
  playbook_id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

export interface PlaybookItem {
  id: string;
  playbook_id: string;
  scenario_id: string;
  section_id: string | null;
  sort_order: number;
  notes: string | null;
}

export interface Favorite {
  user_id: string;
  scenario_id: string;
  created_at: string;
}

export interface Feedback {
  id: string;
  user_id: string;
  scenario_id: string;
  is_helpful: boolean;
  comment: string | null;
  created_at: string;
}

export interface ViewHistory {
  id: string;
  user_id: string;
  scenario_id: string;
  viewed_at: string;
}

export interface PlaybookProgress {
  user_id: string;
  playbook_id: string;
  completed_items: string[];
  started_at: string;
  last_activity_at: string;
  completed_at: string | null;
}

export interface SavedView {
  id: string;
  user_id: string;
  name: string;
  filters: Json;
  is_shared: boolean;
  created_at: string;
}

export interface ConfigHistoryEntry {
  id: string;
  user_id: string | null;
  config_type: string;
  config_id: string | null;
  action: string;
  before_value: Json | null;
  after_value: Json | null;
  impact_summary: string | null;
  created_at: string;
}

/** Result row returned by the `search_scenarios` RPC. */
export interface SearchResult {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: ScenarioStatus;
  is_global: boolean;
  account_id: string | null;
  category_id: string | null;
  issue_type_id: string | null;
  severity_id: string | null;
  impact_scope_id: string | null;
  quick_fix?: string | null;
  sample_ticket_ids?: string[] | null;
  occurrence_count: number;
  last_occurred_at: string | null;
  updated_at: string;
  rank: number;
  total_count: number;
}

/** Facet count row returned by the `get_facet_counts` RPC. */
export interface FacetCount {
  field_id: string;
  field_key: string;
  field_label: string;
  option_id: string;
  option_label: string;
  option_color: string | null;
  count: number;
}

/** Coverage matrix cell returned by the `get_coverage_matrix` RPC. */
export interface CoverageCell {
  row_key: string;
  row_label: string;
  row_color: string | null;
  col_key: string;
  col_label: string;
  col_color: string | null;
  count: number;
}

/** Account playbook row returned by the `get_account_playbook` RPC. */
export interface AccountPlaybookRow {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  quick_fix?: string | null;
  sample_ticket_ids?: string[] | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  issue_type_id: string | null;
  issue_type_label: string | null;
  issue_type_color: string | null;
  severity_id: string | null;
  severity_label: string | null;
  severity_color: string | null;
  impact_scope_id: string | null;
  impact_scope_label: string | null;
  occurrence_count: number;
  is_global: boolean;
  is_pinned: boolean;
  updated_at: string;
  last_occurred_at: string | null;
}

/** Account metrics summary for directory and detail views. */
export interface AccountMetrics {
  account_id: string;
  account_name: string;
  account_code: string;
  accent_color: string | null;
  description?: string | null;
  status?: string;
  total_playbooks: number;
  account_specific_playbooks: number;
  global_playbooks: number;
  total_occurrences: number;
  categories_covered: number;
  last_updated_at: string | null;
}

/** Category playbook row returned by the `get_category_playbook` RPC. */
export interface CategoryPlaybookRow {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  account_id: string | null;
  account_name: string | null;
  account_code: string | null;
  account_color: string | null;
  is_global: boolean;
  issue_type_id: string | null;
  issue_type_label: string | null;
  severity_id: string | null;
  severity_label: string | null;
  occurrence_count: number;
  updated_at: string;
}

/** The full set of filter state driving search, facets and compiled views. */
export interface FilterState {
  query: string;
  accountIds: string[];
  accountMatch: AccountMatchMode;
  categoryIds: string[];
  issueTypeIds: string[];
  severityIds: string[];
  impactScopeIds: string[];
  /** Custom criteria keyed by field id -> selected option ids. */
  custom: Record<string, string[]>;
  sort: SortOption;
  page: number;
  pageSize: number;
}

export type SortOption = 'relevance' | 'frequency' | 'newest' | 'oldest' | 'title' | 'helpful' | 'viewed';
