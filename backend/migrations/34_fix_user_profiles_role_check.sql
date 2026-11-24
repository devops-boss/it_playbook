-- ============================================================================
-- 34_fix_user_profiles_role_check.sql
-- 1. Drop check constraint from pb_user_profiles so any custom role can be stored
-- 2. Update admin_create_user RPC to handle all roles cleanly
-- ============================================================================

-- 1. Drop the legacy check constraint
ALTER TABLE pb_user_profiles DROP CONSTRAINT IF EXISTS pb_user_profiles_role_check;

-- 2. Update admin_create_user RPC
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

  -- Map profile role safely
  IF v_role_name IN ('Super Admin', 'Admin') THEN
    v_profile_role := 'Admin';
  ELSE
    v_profile_role := COALESCE(v_role_name, 'IT Support');
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
  INSERT INTO pb_config_history (table_name, record_id, action, changed_by, old_data, new_data)
  VALUES (
    'pb_user_profiles',
    v_user_id,
    'INSERT',
    p_admin_id,
    '{}'::jsonb,
    jsonb_build_object('email', p_email, 'name', v_name, 'role', v_role_name)
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

GRANT EXECUTE ON FUNCTION admin_create_user(TEXT, TEXT, UUID, TEXT, UUID) TO postgres, supabase_admin, service_role, service, authenticated, anon, public;
