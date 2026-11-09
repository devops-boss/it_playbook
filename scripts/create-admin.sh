#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Creating / verifying admin users in bos-db..."

docker exec -i bos-db psql -U postgres -d postgres << 'EOF'
CREATE OR REPLACE FUNCTION create_or_update_admin(p_email TEXT, p_name TEXT)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_role_id UUID;
  v_pass TEXT := 'hbkPmen_KuZ~JjwV4ZqB';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_email);

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
      crypt(v_pass, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', p_name),
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
    UPDATE auth.users
    SET encrypted_password = crypt(v_pass, gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = v_user_id;
  END IF;

  INSERT INTO pb_user_profiles (id, email, display_name, role, is_active)
  VALUES (v_user_id, p_email, p_name, 'Admin', TRUE)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = 'Admin',
    is_active = TRUE;

  SELECT id INTO v_role_id FROM pb_roles WHERE name = 'Super Admin';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO pb_user_roles (user_id, role_id)
    VALUES (v_user_id, v_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  -- Ensure user has access to all accounts
  INSERT INTO pb_user_accounts (user_id, account_id)
  SELECT v_user_id, a.id FROM pb_accounts a
  ON CONFLICT (user_id, account_id) DO NOTHING;

  RAISE NOTICE 'SUCCESS: % (%) is ready!', p_name, p_email;
END;
$$ LANGUAGE plpgsql;

SELECT create_or_update_admin('paulreinier.vista@bigoutsource.com', 'Reinier Vista');
SELECT create_or_update_admin('devops@bigoutsource.ph', 'DevOps Admin');
SELECT create_or_update_admin('ronald.balza@bigoutsource.com', 'Ronald Balza');
SELECT create_or_update_admin('rbalza@bigoutsource.ph', 'Ronald Balza');
EOF

echo "==> Done! Admin users are active in the database."
