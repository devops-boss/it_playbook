-- ============================================================================
-- 29_user_deletion_and_presence.sql
-- 1. Create pb_user_presence table & heartbeat RPCs for 100% reliable online presence
-- 2. Create delete_user_account RPC for Super Admins to permanently remove users
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PB_USER_PRESENCE (ACTIVE ONLINE TRACKING)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pb_user_presence (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'IT Support',
  photo_url TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON pb_user_presence(last_seen_at);

GRANT ALL ON TABLE pb_user_presence TO postgres, supabase_admin, authenticated, anon, service_role;

ALTER TABLE pb_user_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all users to view presence" ON pb_user_presence;
CREATE POLICY "Allow all users to view presence" ON pb_user_presence
FOR SELECT TO authenticated, anon, service_role
USING (TRUE);

DROP POLICY IF EXISTS "Allow all users to upsert presence" ON pb_user_presence;
CREATE POLICY "Allow all users to upsert presence" ON pb_user_presence
FOR ALL TO authenticated, anon, service_role
USING (TRUE)
WITH CHECK (TRUE);

-- Secure RPC to record presence heartbeat and retrieve current active peers
CREATE OR REPLACE FUNCTION record_presence_heartbeat(
  p_user_id TEXT,
  p_display_name TEXT,
  p_email TEXT,
  p_role TEXT,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_users JSONB;
BEGIN
  -- 1. Upsert current user presence
  INSERT INTO pb_user_presence (user_id, display_name, email, role, photo_url, last_seen_at, updated_at)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_display_name), ''), split_part(p_email, '@', 1), 'User'),
    p_email,
    COALESCE(p_role, 'IT Support'),
    p_photo_url,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    photo_url = COALESCE(EXCLUDED.photo_url, pb_user_presence.photo_url),
    last_seen_at = now(),
    updated_at = now();

  -- 2. Clean up stale records older than 5 minutes
  DELETE FROM pb_user_presence WHERE last_seen_at < (now() - interval '5 minutes');

  -- 3. Return all users active within the last 90 seconds
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', user_id,
      'displayName', display_name,
      'email', email,
      'role', role,
      'photoUrl', photo_url,
      'onlineAt', last_seen_at
    ) ORDER BY last_seen_at DESC
  ) INTO v_users
  FROM pb_user_presence
  WHERE last_seen_at > (now() - interval '5 minutes');

  RETURN jsonb_build_object(
    'success', true,
    'users', COALESCE(v_users, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION record_presence_heartbeat(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon, service_role, postgres, supabase_admin;

-- Secure RPC to remove presence immediately upon signout or tab close
CREATE OR REPLACE FUNCTION remove_presence_heartbeat(p_user_id TEXT)
RETURNS JSONB AS $$
BEGIN
  DELETE FROM pb_user_presence WHERE user_id = p_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION remove_presence_heartbeat(TEXT) TO authenticated, anon, service_role, postgres, supabase_admin;


-- ----------------------------------------------------------------------------
-- 2. SECURE USER DELETION (SUPER ADMIN ONLY)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_user_account(p_target_user_id UUID, p_admin_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_is_super_admin BOOLEAN := FALSE;
  v_target_email TEXT;
  v_target_name TEXT;
  v_admin_role_id UUID;
BEGIN
  -- 1. Prevent an administrator from deleting their own account
  IF p_target_user_id = p_admin_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot delete your own account.');
  END IF;

  -- 2. Validate requesting user is a Super Admin
  SELECT id INTO v_admin_role_id FROM pb_roles WHERE name = 'Super Admin' LIMIT 1;

  IF EXISTS (
    SELECT 1 FROM pb_user_roles 
    WHERE user_id = p_admin_id AND (role_id = v_admin_role_id OR role_id IN (SELECT id FROM pb_roles WHERE name = 'Super Admin'))
  ) OR EXISTS (
    SELECT 1 FROM pb_user_profiles WHERE id = p_admin_id AND (role = 'Super Admin' OR role = 'admin')
  ) THEN
    v_is_super_admin := TRUE;
  END IF;

  IF NOT v_is_super_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Only Super Admins can delete users.');
  END IF;

  -- 3. Capture user metadata for audit logging
  SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_user_id;
  IF v_target_email IS NULL THEN
    SELECT email, display_name INTO v_target_email, v_target_name FROM pb_user_profiles WHERE id = p_target_user_id;
  ELSE
    SELECT display_name INTO v_target_name FROM pb_user_profiles WHERE id = p_target_user_id;
  END IF;

  -- 4. Disassociate authored and updated resources to avoid foreign key errors
  UPDATE pb_scenarios SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE pb_scenarios SET updated_by = NULL WHERE updated_by = p_target_user_id;
  UPDATE pb_playbooks SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE pb_playbooks SET updated_by = NULL WHERE updated_by = p_target_user_id;
  UPDATE pb_categories SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE pb_categories SET updated_by = NULL WHERE updated_by = p_target_user_id;
  UPDATE pb_attachments SET uploaded_by = NULL WHERE uploaded_by = p_target_user_id;
  UPDATE pb_templates SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE pb_versions SET changed_by = NULL WHERE changed_by = p_target_user_id;

  -- 5. Delete relational bindings
  DELETE FROM pb_user_roles WHERE user_id = p_target_user_id;
  DELETE FROM pb_user_accounts WHERE user_id = p_target_user_id;
  DELETE FROM pb_user_presence WHERE user_id = p_target_user_id;
  DELETE FROM pb_favorites WHERE user_id = p_target_user_id;
  DELETE FROM pb_feedback WHERE user_id = p_target_user_id;
  DELETE FROM pb_view_history WHERE user_id = p_target_user_id;
  DELETE FROM pb_playbook_progress WHERE user_id = p_target_user_id;
  DELETE FROM pb_saved_views WHERE user_id = p_target_user_id;

  -- 6. Delete profile and auth credentials
  DELETE FROM pb_user_profiles WHERE id = p_target_user_id;
  DELETE FROM auth.users WHERE id = p_target_user_id;

  -- 7. Record in audit history
  INSERT INTO pb_config_history (table_name, record_id, action, changed_by, old_data, new_data)
  VALUES (
    'pb_user_profiles',
    p_target_user_id,
    'DELETE',
    p_admin_id,
    jsonb_build_object('user_id', p_target_user_id, 'email', v_target_email, 'name', v_target_name),
    jsonb_build_object('deleted_by', p_admin_id, 'timestamp', now())
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION delete_user_account(UUID, UUID) TO authenticated, anon, service_role;

