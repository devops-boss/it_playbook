-- ============================================================================
-- Section 5: Authentication, IAM, and MFA Administration
-- Big Outsource IT Operations Playbook
-- ============================================================================

-- 1. Helper to verify if session has reached MFA AAL2 level
CREATE OR REPLACE FUNCTION is_mfa_verified()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT (auth.jwt()->>'aal') = 'aal2';
$$;

GRANT EXECUTE ON FUNCTION is_mfa_verified() TO authenticated, anon;

-- 2. Admin RPC: Reset MFA for a target user
CREATE OR REPLACE FUNCTION admin_reset_user_mfa(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_deleted_count INT := 0;
BEGIN
  -- Strict permission guard: Admin only
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Only Admins can reset user MFA.';
  END IF;

  -- Delete enrolled MFA factors
  WITH deleted AS (
    DELETE FROM auth.mfa_factors
    WHERE user_id = p_target_user_id
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_count FROM deleted;

  -- Terminate all sessions for the target user to force fresh sign-in and re-enrollment
  DELETE FROM auth.sessions
  WHERE user_id = p_target_user_id;

  -- Log action in pb_audit_log
  INSERT INTO pb_audit_log (user_id, action, entity_type, entity_id, changes)
  VALUES (
    v_caller_id,
    'mfa_reset',
    'user_profile',
    p_target_user_id,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'factors_removed', v_deleted_count,
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'factors_removed', v_deleted_count
  );
END;
$$;

-- 3. Admin RPC: Update user profile and active status
CREATE OR REPLACE FUNCTION admin_update_user_status(
  p_target_user_id UUID,
  p_display_name TEXT,
  p_role TEXT,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_old_profile RECORD;
BEGIN
  -- Guard: Only Admins
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Only Admins can manage users.';
  END IF;

  IF p_role NOT IN ('IT Support', 'Admin') THEN
    RAISE EXCEPTION 'Invalid role. Role must be either IT Support or Admin.';
  END IF;

  SELECT * INTO v_old_profile FROM pb_user_profiles WHERE id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  -- Update profile
  UPDATE pb_user_profiles
  SET
    display_name = COALESCE(p_display_name, display_name),
    role = p_role,
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_target_user_id;

  -- If deactivated, terminate all active sessions immediately
  IF NOT p_is_active THEN
    DELETE FROM auth.sessions WHERE user_id = p_target_user_id;
  END IF;

  -- Log in audit log
  INSERT INTO pb_audit_log (user_id, action, entity_type, entity_id, changes)
  VALUES (
    v_caller_id,
    CASE WHEN NOT p_is_active THEN 'deactivate_user' ELSE 'update_user' END,
    'user_profile',
    p_target_user_id,
    jsonb_build_object(
      'old', to_jsonb(v_old_profile),
      'new', jsonb_build_object('display_name', p_display_name, 'role', p_role, 'is_active', p_is_active)
    )
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_target_user_id);
END;
$$;

-- 4. Admin RPC: Sign a user out of all devices
CREATE OR REPLACE FUNCTION admin_sign_out_user(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_terminated_count INT := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Only Admins can sign out users.';
  END IF;

  WITH deleted AS (
    DELETE FROM auth.sessions
    WHERE user_id = p_target_user_id
    RETURNING id
  )
  SELECT count(*) INTO v_terminated_count FROM deleted;

  INSERT INTO pb_audit_log (user_id, action, entity_type, entity_id, changes)
  VALUES (
    v_caller_id,
    'force_sign_out',
    'user_profile',
    p_target_user_id,
    jsonb_build_object('sessions_terminated', v_terminated_count)
  );

  RETURN jsonb_build_object('success', true, 'sessions_terminated', v_terminated_count);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_user_mfa(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_user_status(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_sign_out_user(UUID) TO authenticated;
