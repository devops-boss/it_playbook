-- ============================================================================
-- 31_user_management_enhancements.sql
-- 1. admin_create_user RPC: Create user with role and account provisioning
-- 2. admin_update_user RPC: Edit user name and email across profiles, auth & presence
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CREATE USER RPC
-- ----------------------------------------------------------------------------
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

  -- Map profile role safely: pb_user_profiles.role is legacy, keep it 'Admin' or 'IT Support'
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

  -- 5. Audit record
  INSERT INTO pb_config_history (user_id, config_type, config_id, action, before_value, after_value, impact_summary)
  VALUES (
    p_admin_id,
    'user_profile',
    v_user_id,
    'create',
    '{}'::jsonb,
    jsonb_build_object('email', p_email, 'name', v_name, 'role', v_role_name),
    'User account created'
  );

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

GRANT EXECUTE ON FUNCTION admin_create_user(TEXT, TEXT, UUID, TEXT, UUID) TO authenticated, anon, service_role, postgres, supabase_admin;


-- ----------------------------------------------------------------------------
-- 2. UPDATE USER (NAME & EMAIL) RPC
-- ----------------------------------------------------------------------------
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
      updated_at = now()
  WHERE user_id = p_user_id::text;

  -- 6. Audit log
  INSERT INTO pb_config_history (user_id, config_type, config_id, action, before_value, after_value, impact_summary)
  VALUES (
    p_admin_id,
    'user_profile',
    p_user_id,
    'update',
    jsonb_build_object('email', v_old_email, 'display_name', v_old_name),
    jsonb_build_object('email', p_email, 'display_name', p_display_name),
    'User profile updated'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

GRANT EXECUTE ON FUNCTION admin_update_user(UUID, TEXT, TEXT, UUID) TO authenticated, anon, service_role, postgres, supabase_admin;

