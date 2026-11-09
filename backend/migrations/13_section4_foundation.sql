-- ============================================================================
-- Section 4: Database Foundation Updates
-- Big Outsource IT Operations Playbook
-- ============================================================================

-- 1. Ensure ticket_url_template column exists on pb_accounts
ALTER TABLE pb_accounts
  ADD COLUMN IF NOT EXISTS ticket_url_template TEXT;

-- 2. Ensure email and role exist on pb_user_profiles
ALTER TABLE pb_user_profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'IT Support' CHECK (role IN ('IT Support', 'Admin'));

-- Populate email and role for existing profiles from auth.users and pb_user_roles
UPDATE pb_user_profiles p
SET
  email = COALESCE(p.email, u.email),
  role = CASE
    WHEN EXISTS (
      SELECT 1 FROM pb_user_roles ur
      JOIN pb_roles r ON r.id = ur.role_id
      WHERE ur.user_id = p.id AND r.name IN ('Super Admin', 'Admin')
    ) THEN 'Admin'
    ELSE 'IT Support'
  END
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.role IS NULL);

-- 3. Define helper functions: is_admin() and is_active_user()
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pb_user_profiles p
    WHERE p.id = auth.uid() AND p.role = 'Admin' AND p.is_active = true
  ) OR EXISTS (
    SELECT 1 FROM pb_user_roles ur
    JOIN pb_roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name IN ('Super Admin', 'Admin')
  );
$$;

CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pb_user_profiles p
    WHERE p.id = auth.uid() AND p.is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_active_user() TO authenticated, anon;

-- 4. Audit trigger for pb_user_profiles
DROP TRIGGER IF EXISTS trg_audit_user_profiles ON pb_user_profiles;
CREATE TRIGGER trg_audit_user_profiles
  AFTER INSERT OR DELETE OR UPDATE ON pb_user_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_entity_change();


-- 5. RLS policies on pb_user_profiles
ALTER TABLE pb_user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active users can view user profiles" ON pb_user_profiles;
CREATE POLICY "Active users can view user profiles"
  ON pb_user_profiles FOR SELECT
  TO authenticated
  USING (is_active_user());

DROP POLICY IF EXISTS "Only Admins can insert user profiles" ON pb_user_profiles;
CREATE POLICY "Only Admins can insert user profiles"
  ON pb_user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Only Admins can update user profiles" ON pb_user_profiles;
CREATE POLICY "Only Admins can update user profiles"
  ON pb_user_profiles FOR UPDATE
  TO authenticated
  USING (is_admin() OR (id = auth.uid() AND is_active_user()))
  WITH CHECK (is_admin() OR (id = auth.uid() AND is_active_user()));

DROP POLICY IF EXISTS "Only Admins can delete user profiles" ON pb_user_profiles;
CREATE POLICY "Only Admins can delete user profiles"
  ON pb_user_profiles FOR DELETE
  TO authenticated
  USING (is_admin());
