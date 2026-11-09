-- ============================================================================
-- Section 8 Migration: Manage Permissions and Accounts RLS
-- ============================================================================

-- 1. Upgrade is_super_admin() to recognize Admin role
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pb_user_roles ur
    JOIN pb_roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name IN ('Super Admin', 'Admin')
  ) OR EXISTS (
    SELECT 1
    FROM pb_user_profiles p
    WHERE p.id = auth.uid() AND p.role = 'Admin'
  );
$$;

-- 2. Update pb_accounts RLS to allow users with manage_accounts permission (IT Support & Admin)
DROP POLICY IF EXISTS "super admin can create accounts" ON pb_accounts;
DROP POLICY IF EXISTS "super admin can update accounts" ON pb_accounts;
DROP POLICY IF EXISTS "super admin can delete accounts" ON pb_accounts;
DROP POLICY IF EXISTS "view accessible accounts" ON pb_accounts;

CREATE POLICY "view accessible accounts" ON pb_accounts
  FOR SELECT USING (
    is_global = true 
    OR has_account_access(id) 
    OR has_permission('manage_accounts') 
    OR is_super_admin()
  );

CREATE POLICY "manage accounts create" ON pb_accounts
  FOR INSERT WITH CHECK (
    has_permission('manage_accounts') OR is_super_admin()
  );

CREATE POLICY "manage accounts update" ON pb_accounts
  FOR UPDATE USING (
    has_permission('manage_accounts') OR is_super_admin()
  ) WITH CHECK (
    has_permission('manage_accounts') OR is_super_admin()
  );

CREATE POLICY "manage accounts delete" ON pb_accounts
  FOR DELETE USING (
    has_permission('manage_accounts') OR is_super_admin()
  );

-- 3. Ensure structure tables allow manage_criteria
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pb_section_definitions') THEN
    DROP POLICY IF EXISTS "manage section definitions" ON pb_section_definitions;
    CREATE POLICY "manage section definitions" ON pb_section_definitions
      FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
      WITH CHECK (has_permission('manage_criteria') OR is_super_admin());
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pb_node_types') THEN
    DROP POLICY IF EXISTS "manage node types" ON pb_node_types;
    CREATE POLICY "manage node types" ON pb_node_types
      FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
      WITH CHECK (has_permission('manage_criteria') OR is_super_admin());
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pb_outcomes') THEN
    DROP POLICY IF EXISTS "manage outcomes" ON pb_outcomes;
    CREATE POLICY "manage outcomes" ON pb_outcomes
      FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
      WITH CHECK (has_permission('manage_criteria') OR is_super_admin());
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pb_tags') THEN
    DROP POLICY IF EXISTS "manage tags" ON pb_tags;
    CREATE POLICY "manage tags" ON pb_tags
      FOR ALL USING (has_permission('manage_criteria') OR is_super_admin())
      WITH CHECK (has_permission('manage_criteria') OR is_super_admin());
  END IF;
END $$;
