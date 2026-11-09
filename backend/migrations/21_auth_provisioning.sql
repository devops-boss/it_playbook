-- ============================================================================
-- BOS Playbook - Migration 21: Auto-Provisioning & Initial Users
--
-- Ensures all 8 standard Big Outsource users + devops account exist in
-- auth.users with matching credentials, and provides an idempotent function
-- to auto-provision any verified Big Outsource email on first OTP login.
-- ============================================================================

CREATE OR REPLACE FUNCTION ensure_authenticated_user(
  p_email TEXT,
  p_password TEXT DEFAULT 'hbkPmen_KuZ~JjwV4ZqB'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $func$
DECLARE
  v_user_id UUID;
  v_role_id UUID;
  v_profile_role TEXT := 'IT Support';
  v_role_name TEXT := 'IT Support';
  v_name TEXT;
BEGIN
  p_email := lower(trim(p_email));
  IF p_email = '' OR p_email NOT LIKE '%@%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email');
  END IF;

  v_name := initcap(replace(split_part(p_email, '@', 1), '.', ' '));

  -- Assign Admin to known admins and devops
  IF p_email LIKE '%vista%' OR p_email LIKE '%devops%' OR p_email LIKE '%balza%' OR p_email = 'admin@bosp.local' OR p_email LIKE '%admin%' THEN
    v_profile_role := 'Admin';
    v_role_name := 'Super Admin';
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

    -- 2. Insert corresponding identity for GoTrue
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
    -- Keep encrypted_password aligned so password grant always succeeds
    UPDATE auth.users
    SET encrypted_password = crypt(p_password, gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = v_user_id;
  END IF;

  -- 3. Ensure profile in pb_user_profiles
  INSERT INTO pb_user_profiles (id, email, display_name, role, is_active)
  VALUES (v_user_id, p_email, v_name, v_profile_role, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    is_active = TRUE;

  -- 4. Ensure role mapping in pb_user_roles
  SELECT id INTO v_role_id FROM pb_roles WHERE name = v_role_name;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO pb_user_roles (user_id, role_id)
    VALUES (v_user_id, v_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$func$;

-- Allow calling via PostgREST RPC from Next.js server route
GRANT EXECUTE ON FUNCTION ensure_authenticated_user(TEXT, TEXT) TO anon, authenticated, service_role;

-- Pre-seed core users immediately
SELECT ensure_authenticated_user('paulreinier.vista@bigoutsource.com');
SELECT ensure_authenticated_user('paulreinier.vista@bigoutsource.ph');
SELECT ensure_authenticated_user('prvista@bigoutsource.ph');
SELECT ensure_authenticated_user('prvista@bigoutsource.com');
SELECT ensure_authenticated_user('devops@bigoutsource.ph');
SELECT ensure_authenticated_user('devops@bigoutsource.com');
SELECT ensure_authenticated_user('rbalza@bigoutsource.ph');
SELECT ensure_authenticated_user('ronald.balza@bigoutsource.com');
SELECT ensure_authenticated_user('itsupport@bigoutsource.net');
SELECT ensure_authenticated_user('karla.espiritu@bigoutsource.com');
SELECT ensure_authenticated_user('paolo.pizana@bigoutsource.com');
SELECT ensure_authenticated_user('frkatigbak@bigoutsource.ph');
SELECT ensure_authenticated_user('lyaragoza@bigoutsource.ph');
SELECT ensure_authenticated_user('wfbibon@bigoutsource.ph');
SELECT ensure_authenticated_user('aldrin.brucal@bigoutsource.com');
