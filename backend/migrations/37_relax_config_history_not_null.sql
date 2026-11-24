-- ============================================================================
-- 37_relax_config_history_not_null.sql
-- 1. Relax NOT NULL on pb_config_history columns and add defaults
-- 2. Make audit inserts inside user RPCs resilient so they never abort transactions
-- ============================================================================

-- 1. Relax pb_config_history column constraints
ALTER TABLE pb_config_history ALTER COLUMN config_type DROP NOT NULL;
ALTER TABLE pb_config_history ALTER COLUMN config_type SET DEFAULT 'user_profile';
ALTER TABLE pb_config_history ALTER COLUMN action DROP NOT NULL;
ALTER TABLE pb_config_history ALTER COLUMN action SET DEFAULT 'create';

-- Compatibility columns
ALTER TABLE pb_config_history
  ADD COLUMN IF NOT EXISTS table_name TEXT,
  ADD COLUMN IF NOT EXISTS record_id UUID,
  ADD COLUMN IF NOT EXISTS changed_by UUID,
  ADD COLUMN IF NOT EXISTS old_data JSONB,
  ADD COLUMN IF NOT EXISTS new_data JSONB;

-- 2. Drop any remaining check constraint on pb_user_profiles
ALTER TABLE pb_user_profiles DROP CONSTRAINT IF EXISTS pb_user_profiles_role_check;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'pb_user_profiles'::regclass
      AND contype = 'c'
  ) LOOP
    EXECUTE 'ALTER TABLE pb_user_profiles DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname) || ';';
  END LOOP;
END $$;

-- 3. Replace admin_create_user RPC
CREATE OR REPLACE FUNCTION admin_create_user(
  p_email TEXT,
  p_display_name TEXT,
  p_role_id UUID DEFAULT NULL,
  p_password TEXT DEFAULT 'hbkPmen_KuZ~JjwV4ZqB',
  p_admin_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_role_id UUID := p_role_id;
  v_role_name TEXT := 'IT Support';
  v_profile_role TEXT := 'IT Support';
  v_name TEXT;
BEGIN
  p_email := lower(trim(p_email));
  IF p_email = '' OR p_email NOT LIKE '%@%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email address');
  END IF;

  v_name := COALESCE(NULLIF(trim(p_display_name), ''), initcap(replace(split_part(p_email, '@', 1), '.', ' ')));

  -- Determine role name if role_id is provided
  IF v_role_id IS NOT NULL THEN
    SELECT name INTO v_role_name FROM pb_roles WHERE id = v_role_id LIMIT 1;
  ELSE
    SELECT id, name INTO v_role_id, v_role_name FROM pb_roles WHERE name NOT IN ('Admin', 'Super Admin') ORDER BY sort_order LIMIT 1;
    IF v_role_id IS NULL THEN
      SELECT id, name INTO v_role_id, v_role_name FROM pb_roles ORDER BY sort_order LIMIT 1;
    END IF;
  END IF;

  -- Legacy pb_user_profiles.role is strictly 'Admin' or 'IT Support'
  IF v_role_name IN ('Super Admin', 'Admin') THEN
    v_profile_role := 'Admin';
  ELSE
    v_profile_role := 'IT Support';
  END IF;

  -- 1. Check or insert into auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = p_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new,
      email_change_token_current, email_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      p_email,
      crypt(p_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', v_name),
      'authenticated',
      'authenticated',
      now(),
      now(),
      '', '', '', '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', p_email),
      'email',
      now(),
      now(),
      now()
    ) ON CONFLICT DO NOTHING;
  ELSE
    -- Update password and confirm email
    UPDATE auth.users
    SET encrypted_password = crypt(p_password, gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_user_meta_data = jsonb_build_object('display_name', v_name)
    WHERE id = v_user_id;
  END IF;

  -- 2. Upsert profile in pb_user_profiles
  INSERT INTO pb_user_profiles (id, email, display_name, role, is_active)
  VALUES (v_user_id, p_email, v_name, v_profile_role, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    is_active = TRUE;

  -- 3. Assign role in pb_user_roles
  IF v_role_id IS NOT NULL THEN
    INSERT INTO pb_user_roles (user_id, role_id)
    VALUES (v_user_id, v_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  -- 4. Grant access to all accounts by default
  INSERT INTO pb_user_accounts (user_id, account_id)
  SELECT v_user_id, a.id FROM pb_accounts a
  ON CONFLICT (user_id, account_id) DO NOTHING;

  -- 5. Audit record (wrapped in block to never abort user creation)
  BEGIN
    INSERT INTO pb_config_history (
      user_id, config_type, config_id, action, before_value, after_value, impact_summary,
      table_name, record_id, changed_by, old_data, new_data
    ) VALUES (
      p_admin_id,
      'user_profile',
      v_user_id,
      'create',
      '{}'::jsonb,
      jsonb_build_object('email', p_email, 'name', v_name, 'role', v_role_name),
      'User account created',
      'pb_user_profiles',
      v_user_id,
      p_admin_id,
      '{}'::jsonb,
      jsonb_build_object('email', p_email, 'name', v_name, 'role', v_role_name)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'display_name', v_name,
    'email', p_email,
    'role_id', v_role_id,
    'role_name', v_role_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

-- 4. Replace admin_update_user RPC
CREATE OR REPLACE FUNCTION admin_update_user(
  p_user_id UUID,
  p_display_name TEXT,
  p_email TEXT,
  p_admin_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_old_email TEXT;
  v_old_name TEXT;
BEGIN
  p_email := lower(trim(p_email));
  p_display_name := trim(p_display_name);

  IF p_email = '' OR p_email NOT LIKE '%@%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email address');
  END IF;

  IF p_display_name = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Display name cannot be empty');
  END IF;

  -- 1. Capture old data for audit
  SELECT email, display_name INTO v_old_email, v_old_name
  FROM pb_user_profiles WHERE id = p_user_id;

  -- 2. Update pb_user_profiles
  UPDATE pb_user_profiles
  SET display_name = p_display_name,
      email = p_email,
      updated_at = now()
  WHERE id = p_user_id;

  -- 3. Update auth.users
  UPDATE auth.users
  SET email = p_email,
      raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{display_name}', to_jsonb(p_display_name)),
      updated_at = now()
  WHERE id = p_user_id;

  -- 4. Update auth.identities
  UPDATE auth.identities
  SET identity_data = jsonb_set(COALESCE(identity_data, '{}'::jsonb), '{email}', to_jsonb(p_email)),
      updated_at = now()
  WHERE user_id = p_user_id;

  -- 5. Update pb_user_presence
  UPDATE pb_user_presence
  SET display_name = p_display_name,
      email = p_email,
      last_seen_at = now()
  WHERE user_id = p_user_id;

  -- 6. Audit record (wrapped in block to never abort user update)
  BEGIN
    INSERT INTO pb_config_history (
      user_id, config_type, config_id, action, before_value, after_value, impact_summary,
      table_name, record_id, changed_by, old_data, new_data
    ) VALUES (
      p_admin_id,
      'user_profile',
      p_user_id,
      'update',
      jsonb_build_object('email', v_old_email, 'name', v_old_name),
      jsonb_build_object('email', p_email, 'name', p_display_name),
      'User profile updated',
      'pb_user_profiles',
      p_user_id,
      p_admin_id,
      jsonb_build_object('email', v_old_email, 'name', v_old_name),
      jsonb_build_object('email', p_email, 'name', p_display_name)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'display_name', p_display_name,
    'email', p_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

-- 5. Replace delete_user_account RPC
CREATE OR REPLACE FUNCTION delete_user_account(
  p_target_user_id UUID,
  p_admin_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_is_super_admin BOOLEAN;
  v_target_email TEXT;
  v_target_name TEXT;
BEGIN
  -- 1. Check if caller is super admin
  SELECT (role = 'Super Admin' OR role = 'admin') INTO v_is_super_admin
  FROM pb_user_profiles WHERE id = p_admin_id;

  IF NOT COALESCE(v_is_super_admin, FALSE) THEN
    SELECT EXISTS (
      SELECT 1 FROM pb_user_roles ur
      JOIN pb_roles r ON r.id = ur.role_id
      WHERE ur.user_id = p_admin_id AND r.name IN ('Super Admin', 'Admin')
    ) INTO v_is_super_admin;
  END IF;

  IF NOT COALESCE(v_is_super_admin, FALSE) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Super Admin role required');
  END IF;

  -- 2. Capture user info for audit before deleting
  SELECT email, display_name INTO v_target_email, v_target_name FROM pb_user_profiles WHERE id = p_target_user_id;

  -- 3. Delete presence
  DELETE FROM pb_user_presence WHERE user_id = p_target_user_id;

  -- 4. Delete user roles and account links
  DELETE FROM pb_user_roles WHERE user_id = p_target_user_id;
  DELETE FROM pb_user_accounts WHERE user_id = p_target_user_id;

  -- 5. Delete user activity and progress
  DELETE FROM pb_user_favorites WHERE user_id = p_target_user_id;
  DELETE FROM pb_playbook_progress WHERE user_id = p_target_user_id;
  DELETE FROM pb_saved_views WHERE user_id = p_target_user_id;

  -- 6. Delete profile and auth credentials
  DELETE FROM pb_user_profiles WHERE id = p_target_user_id;
  DELETE FROM auth.users WHERE id = p_target_user_id;

  -- 7. Record in audit history (wrapped in block)
  BEGIN
    INSERT INTO pb_config_history (
      user_id, config_type, config_id, action, before_value, after_value, impact_summary,
      table_name, record_id, changed_by, old_data, new_data
    ) VALUES (
      p_admin_id,
      'user_profile',
      p_target_user_id,
      'delete',
      jsonb_build_object('user_id', p_target_user_id, 'email', v_target_email, 'name', v_target_name),
      jsonb_build_object('deleted_by', p_admin_id, 'timestamp', now()),
      'User account deleted',
      'pb_user_profiles',
      p_target_user_id,
      p_admin_id,
      jsonb_build_object('user_id', p_target_user_id, 'email', v_target_email, 'name', v_target_name),
      jsonb_build_object('deleted_by', p_admin_id, 'timestamp', now())
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

GRANT EXECUTE ON FUNCTION admin_create_user(TEXT, TEXT, UUID, TEXT, UUID) TO postgres, supabase_admin, service_role, service, authenticated, anon, public;
GRANT EXECUTE ON FUNCTION admin_update_user(UUID, TEXT, TEXT, UUID) TO postgres, supabase_admin, service_role, service, authenticated, anon, public;
GRANT EXECUTE ON FUNCTION delete_user_account(UUID, UUID) TO postgres, supabase_admin, service_role, service, authenticated, anon, public;
