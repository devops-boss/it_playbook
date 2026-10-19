-- ============================================================================
-- BOS Playbook - Row Level Security Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE pb_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_criteria_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_criteria_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_account_criteria_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_section_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_node_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_synonyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_scenario_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_scenario_criteria_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_flowcharts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_sample_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_related_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_playbook_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_playbook_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_playbook_criteria_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_view_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_playbook_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_search_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_config_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_saved_views ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Check if user has a specific permission
CREATE OR REPLACE FUNCTION has_permission(perm TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pb_user_roles ur
    JOIN pb_role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND rp.permission_name = perm
      AND rp.allowed = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if user has Super Admin role
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pb_user_roles ur
    JOIN pb_roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'Super Admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if user has access to account
CREATE OR REPLACE FUNCTION has_account_access(account UUID)
RETURNS BOOLEAN AS $$
  SELECT
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM pb_user_accounts ua
      WHERE ua.user_id = auth.uid() AND ua.account_id = account
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================================
-- pb_accounts policies
-- ============================================================================
CREATE POLICY "view accessible accounts" ON pb_accounts
FOR SELECT USING (
  is_global = TRUE
  OR has_account_access(id)
  OR is_super_admin()
);

CREATE POLICY "super admin can create accounts" ON pb_accounts
FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "super admin can update accounts" ON pb_accounts
FOR UPDATE USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "super admin can delete accounts" ON pb_accounts
FOR DELETE USING (is_super_admin());

-- ============================================================================
-- pb_user_profiles policies
-- ============================================================================
CREATE POLICY "view own profile" ON pb_user_profiles
FOR SELECT USING (id = auth.uid() OR is_super_admin());

CREATE POLICY "update own profile" ON pb_user_profiles
FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "super admin manage profiles" ON pb_user_profiles
FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ============================================================================
-- pb_roles policies
-- ============================================================================
CREATE POLICY "view roles" ON pb_roles
FOR SELECT USING (TRUE);

CREATE POLICY "super admin manage roles" ON pb_roles
FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ============================================================================
-- pb_role_permissions policies
-- ============================================================================
CREATE POLICY "view permissions" ON pb_role_permissions
FOR SELECT USING (TRUE);

CREATE POLICY "super admin manage permissions" ON pb_role_permissions
FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ============================================================================
-- pb_user_roles policies
-- ============================================================================
CREATE POLICY "view user roles" ON pb_user_roles
FOR SELECT USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "super admin manage user roles" ON pb_user_roles
FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ============================================================================
-- pb_user_accounts policies
-- ============================================================================
CREATE POLICY "view own account access" ON pb_user_accounts
FOR SELECT USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "super admin manage account access" ON pb_user_accounts
FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ============================================================================
-- pb_categories policies
-- ============================================================================
CREATE POLICY "view categories" ON pb_categories
FOR SELECT USING (is_active = TRUE OR has_permission('manage_criteria') OR is_super_admin());

CREATE POLICY "manage categories" ON pb_categories
FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
WITH CHECK (has_permission('manage_criteria') OR is_super_admin());

-- ============================================================================
-- pb_criteria_fields policies
-- ============================================================================
CREATE POLICY "view criteria fields" ON pb_criteria_fields
FOR SELECT USING (is_active = TRUE OR has_permission('manage_criteria') OR is_super_admin());

CREATE POLICY "manage criteria fields" ON pb_criteria_fields
FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
WITH CHECK (has_permission('manage_criteria') OR is_super_admin());

-- ============================================================================
-- pb_criteria_options policies
-- ============================================================================
CREATE POLICY "view criteria options" ON pb_criteria_options
FOR SELECT USING (is_active = TRUE OR has_permission('manage_criteria') OR is_super_admin());

CREATE POLICY "manage criteria options" ON pb_criteria_options
FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
WITH CHECK (has_permission('manage_criteria') OR is_super_admin());

-- ============================================================================
-- pb_account_criteria_options policies
-- ============================================================================
CREATE POLICY "view account criteria options" ON pb_account_criteria_options
FOR SELECT USING (TRUE);

CREATE POLICY "manage account criteria options" ON pb_account_criteria_options
FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
WITH CHECK (has_permission('manage_criteria') OR is_super_admin());

-- ============================================================================
-- pb_section_definitions policies
-- ============================================================================
CREATE POLICY "view section definitions" ON pb_section_definitions
FOR SELECT USING (is_active = TRUE OR has_permission('manage_criteria') OR is_super_admin());

CREATE POLICY "manage section definitions" ON pb_section_definitions
FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
WITH CHECK (has_permission('manage_criteria') OR is_super_admin());

-- ============================================================================
-- pb_templates policies
-- ============================================================================
CREATE POLICY "view templates" ON pb_templates
FOR SELECT USING (is_active = TRUE OR account_id IS NULL OR has_account_access(account_id) OR is_super_admin());

CREATE POLICY "create templates" ON pb_templates
FOR INSERT WITH CHECK (has_permission('create_scenarios') OR is_super_admin());

CREATE POLICY "update templates" ON pb_templates
FOR UPDATE USING (has_permission('manage_criteria') OR account_id IS NULL OR has_account_access(account_id) OR is_super_admin())
WITH CHECK (has_permission('manage_criteria') OR account_id IS NULL OR has_account_access(account_id) OR is_super_admin());

CREATE POLICY "delete templates" ON pb_templates
FOR DELETE USING (has_permission('manage_criteria') OR is_super_admin());

-- ============================================================================
-- pb_node_types policies
-- ============================================================================
CREATE POLICY "view node types" ON pb_node_types
FOR SELECT USING (is_active = TRUE OR has_permission('manage_criteria') OR is_super_admin());

CREATE POLICY "manage node types" ON pb_node_types
FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
WITH CHECK (has_permission('manage_criteria') OR is_super_admin());

-- ============================================================================
-- pb_outcomes policies
-- ============================================================================
CREATE POLICY "view outcomes" ON pb_outcomes
FOR SELECT USING (is_active = TRUE OR has_permission('manage_criteria') OR is_super_admin());

CREATE POLICY "manage outcomes" ON pb_outcomes
FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
WITH CHECK (has_permission('manage_criteria') OR is_super_admin());

-- ============================================================================
-- pb_settings policies
-- ============================================================================
CREATE POLICY "view settings" ON pb_settings
FOR SELECT USING (
  scope = 'global'
  OR (account_id IS NOT NULL AND has_account_access(account_id))
  OR is_super_admin()
);

CREATE POLICY "manage settings" ON pb_settings
FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
WITH CHECK (has_permission('manage_criteria') OR is_super_admin());

-- ============================================================================
-- pb_synonyms policies
-- ============================================================================
CREATE POLICY "view synonyms" ON pb_synonyms
FOR SELECT USING (TRUE);

CREATE POLICY "manage synonyms" ON pb_synonyms
FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
WITH CHECK (has_permission('manage_criteria') OR is_super_admin());

-- ============================================================================
-- pb_tags policies
-- ============================================================================
CREATE POLICY "view tags" ON pb_tags
FOR SELECT USING (is_active = TRUE OR has_permission('manage_criteria') OR is_super_admin());

CREATE POLICY "manage tags" ON pb_tags
FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
WITH CHECK (has_permission('manage_criteria') OR is_super_admin());

-- ============================================================================
-- pb_scenarios policies
-- ============================================================================
-- View: published scenarios for accessible accounts, plus own drafts
CREATE POLICY "view scenarios" ON pb_scenarios
FOR SELECT USING (
  deleted_at IS NULL AND (
    -- Super admin sees all
    is_super_admin()
    -- Published scenarios for accessible accounts
    OR (
      status = 'published'
      AND (
        is_global = TRUE
        OR account_id IS NULL
        OR has_account_access(account_id)
        OR EXISTS (
          SELECT 1 FROM pb_scenario_accounts sa
          WHERE sa.scenario_id = pb_scenarios.id AND has_account_access(sa.account_id)
        )
      )
    )
    -- Editors can see their own drafts
    OR (created_by = auth.uid())
    -- Users with edit_any can see all non-deleted
    OR (has_permission('edit_any_scenario'))
  )
);

-- Create: users with create_scenarios permission
CREATE POLICY "create scenarios" ON pb_scenarios
FOR INSERT WITH CHECK (
  has_permission('create_scenarios') OR is_super_admin()
);

-- Update: edit_own (creator), edit_any, publish, or super admin
CREATE POLICY "update scenarios" ON pb_scenarios
FOR UPDATE USING (
  is_super_admin()
  OR has_permission('edit_any_scenario')
  OR (created_by = auth.uid() AND has_permission('edit_own_scenario'))
  OR (status = 'draft' AND created_by = auth.uid())
  OR (status = 'pending_review' AND has_permission('review_scenario'))
)
WITH CHECK (TRUE);

-- Delete: soft delete only for edit_any or super admin
CREATE POLICY "delete scenarios" ON pb_scenarios
FOR DELETE USING (is_super_admin() OR has_permission('edit_any_scenario'));

-- ============================================================================
-- pb_scenario_accounts policies
-- NOTE: policies that reference pb_scenarios must be split per operation.
-- A FOR ALL policy also governs SELECT, which would recurse: pb_scenarios'
-- policy reads pb_scenario_accounts, whose policy reads pb_scenarios.
-- ============================================================================
CREATE POLICY "view scenario accounts" ON pb_scenario_accounts
FOR SELECT USING (TRUE);

CREATE POLICY "insert scenario accounts" ON pb_scenario_accounts
FOR INSERT WITH CHECK (
  has_permission('edit_any_scenario')
  OR is_super_admin()
  OR EXISTS (
    SELECT 1 FROM pb_scenarios s
    WHERE s.id = pb_scenario_accounts.scenario_id AND s.created_by = auth.uid()
  )
);

CREATE POLICY "update scenario accounts" ON pb_scenario_accounts
FOR UPDATE USING (
  has_permission('edit_any_scenario')
  OR is_super_admin()
  OR EXISTS (
    SELECT 1 FROM pb_scenarios s
    WHERE s.id = pb_scenario_accounts.scenario_id AND s.created_by = auth.uid()
  )
)
WITH CHECK (
  has_permission('edit_any_scenario')
  OR is_super_admin()
  OR EXISTS (
    SELECT 1 FROM pb_scenarios s
    WHERE s.id = pb_scenario_accounts.scenario_id AND s.created_by = auth.uid()
  )
);

CREATE POLICY "delete scenario accounts" ON pb_scenario_accounts
FOR DELETE USING (
  has_permission('edit_any_scenario')
  OR is_super_admin()
  OR EXISTS (
    SELECT 1 FROM pb_scenarios s
    WHERE s.id = pb_scenario_accounts.scenario_id AND s.created_by = auth.uid()
  )
);

-- ============================================================================
-- pb_scenario_criteria_values policies
-- Split per operation to avoid SELECT-triggered recursion with pb_scenarios.
-- ============================================================================
CREATE POLICY "view criteria values" ON pb_scenario_criteria_values
FOR SELECT USING (TRUE);

CREATE POLICY "insert criteria values" ON pb_scenario_criteria_values
FOR INSERT WITH CHECK (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_scenario_criteria_values.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
);

CREATE POLICY "update criteria values" ON pb_scenario_criteria_values
FOR UPDATE USING (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_scenario_criteria_values.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
)
WITH CHECK (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_scenario_criteria_values.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
);

CREATE POLICY "delete criteria values" ON pb_scenario_criteria_values
FOR DELETE USING (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_scenario_criteria_values.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
);

-- ============================================================================
-- pb_flowcharts policies
-- ============================================================================
CREATE POLICY "view flowcharts" ON pb_flowcharts
FOR SELECT USING (
  EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_flowcharts.scenario_id)
);

CREATE POLICY "insert flowcharts" ON pb_flowcharts
FOR INSERT WITH CHECK (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_flowcharts.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
);

CREATE POLICY "update flowcharts" ON pb_flowcharts
FOR UPDATE USING (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_flowcharts.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
)
WITH CHECK (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_flowcharts.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
);

CREATE POLICY "delete flowcharts" ON pb_flowcharts
FOR DELETE USING (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_flowcharts.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
);

-- ============================================================================
-- pb_sample_tickets policies
-- ============================================================================
CREATE POLICY "view sample tickets" ON pb_sample_tickets
FOR SELECT USING (
  EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_sample_tickets.scenario_id)
);

CREATE POLICY "insert sample tickets" ON pb_sample_tickets
FOR INSERT WITH CHECK (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_sample_tickets.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
);

CREATE POLICY "update sample tickets" ON pb_sample_tickets
FOR UPDATE USING (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_sample_tickets.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
)
WITH CHECK (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_sample_tickets.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
);

CREATE POLICY "delete sample tickets" ON pb_sample_tickets
FOR DELETE USING (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_sample_tickets.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
);

-- ============================================================================
-- pb_attachments policies
-- ============================================================================
CREATE POLICY "view attachments" ON pb_attachments
FOR SELECT USING (
  EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_attachments.scenario_id)
);

CREATE POLICY "insert attachments" ON pb_attachments
FOR INSERT WITH CHECK (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_attachments.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
);

CREATE POLICY "update attachments" ON pb_attachments
FOR UPDATE USING (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_attachments.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
)
WITH CHECK (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_attachments.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
);

CREATE POLICY "delete attachments" ON pb_attachments
FOR DELETE USING (
  has_permission('edit_any_scenario')
  OR EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_attachments.scenario_id AND s.created_by = auth.uid())
  OR is_super_admin()
);

-- ============================================================================
-- pb_related_scenarios policies
-- ============================================================================
CREATE POLICY "view related scenarios" ON pb_related_scenarios
FOR SELECT USING (TRUE);

CREATE POLICY "manage related scenarios" ON pb_related_scenarios
FOR ALL USING (has_permission('edit_any_scenario') OR is_super_admin())
WITH CHECK (has_permission('edit_any_scenario') OR is_super_admin());

-- ============================================================================
-- pb_versions policies
-- ============================================================================
CREATE POLICY "view versions" ON pb_versions
FOR SELECT USING (
  EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_versions.scenario_id)
);

CREATE POLICY "manage versions" ON pb_versions
FOR ALL USING (has_permission('edit_any_scenario') OR is_super_admin())
WITH CHECK (has_permission('edit_any_scenario') OR is_super_admin());

-- ============================================================================
-- pb_playbooks policies
-- ============================================================================
CREATE POLICY "view playbooks" ON pb_playbooks
FOR SELECT USING (
  deleted_at IS NULL AND (
    is_super_admin()
    OR status = 'published'
    OR (account_id IS NOT NULL AND has_account_access(account_id))
    OR created_by = auth.uid()
    OR has_permission('edit_any_scenario')
  )
);

CREATE POLICY "create playbooks" ON pb_playbooks
FOR INSERT WITH CHECK (has_permission('create_scenarios') OR is_super_admin());

CREATE POLICY "update playbooks" ON pb_playbooks
FOR UPDATE USING (
  is_super_admin()
  OR has_permission('edit_any_scenario')
  OR (created_by = auth.uid() AND has_permission('edit_own_scenario'))
  OR (status = 'pending_review' AND has_permission('review_scenario'))
)
WITH CHECK (TRUE);

CREATE POLICY "delete playbooks" ON pb_playbooks
FOR DELETE USING (is_super_admin() OR has_permission('edit_any_scenario'));

-- ============================================================================
-- pb_playbook_items policies
-- ============================================================================
CREATE POLICY "view playbook items" ON pb_playbook_items
FOR SELECT USING (TRUE);

CREATE POLICY "manage playbook items" ON pb_playbook_items
FOR ALL USING (has_permission('edit_any_scenario') OR is_super_admin())
WITH CHECK (has_permission('edit_any_scenario') OR is_super_admin());

-- ============================================================================
-- pb_playbook_sections policies
-- ============================================================================
CREATE POLICY "view playbook sections" ON pb_playbook_sections
FOR SELECT USING (TRUE);

CREATE POLICY "manage playbook sections" ON pb_playbook_sections
FOR ALL USING (has_permission('edit_any_scenario') OR is_super_admin())
WITH CHECK (has_permission('edit_any_scenario') OR is_super_admin());

-- ============================================================================
-- pb_playbook_criteria_values policies
-- ============================================================================
CREATE POLICY "view playbook criteria values" ON pb_playbook_criteria_values
FOR SELECT USING (TRUE);

CREATE POLICY "manage playbook criteria values" ON pb_playbook_criteria_values
FOR ALL USING (has_permission('edit_any_scenario') OR is_super_admin())
WITH CHECK (has_permission('edit_any_scenario') OR is_super_admin());

-- ============================================================================
-- User-scoped data policies (favorites, feedback, view history, progress)
-- ============================================================================
CREATE POLICY "view own favorites" ON pb_favorites
FOR SELECT USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "manage own favorites" ON pb_favorites
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "view feedback" ON pb_feedback
FOR SELECT USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "create feedback" ON pb_feedback
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "update own feedback" ON pb_feedback
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "view own view history" ON pb_view_history
FOR SELECT USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "create view history" ON pb_view_history
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "view own progress" ON pb_playbook_progress
FOR SELECT USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "manage own progress" ON pb_playbook_progress
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "view own saved views" ON pb_saved_views
FOR SELECT USING (user_id = auth.uid() OR is_shared = TRUE OR is_super_admin());

CREATE POLICY "manage own saved views" ON pb_saved_views
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- Analytics and audit policies (read for admins, write for system)
-- ============================================================================
CREATE POLICY "view search log" ON pb_search_log
FOR SELECT USING (user_id = auth.uid() OR has_permission('view_analytics') OR is_super_admin());

CREATE POLICY "create search log" ON pb_search_log
FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "view audit log" ON pb_audit_log
FOR SELECT USING (has_permission('view_analytics') OR is_super_admin());

CREATE POLICY "view config history" ON pb_config_history
FOR SELECT USING (has_permission('view_analytics') OR is_super_admin());

-- ============================================================================
-- Grants
--
-- Supabase provisions these on the `public` schema for anon/authenticated/
-- service_role. In a bare Postgres (the local-test path) they must be
-- applied explicitly, so we grant them here too. Table-level RLS still
-- governs what each role can actually read or write.
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Function EXECUTE grants live in 08_function_grants.sql because the RPC
-- functions they reference are created in 07_seed_criteria.sql.

-- Default privileges so future tables/sequences are reachable
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;