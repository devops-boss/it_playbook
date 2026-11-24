-- ============================================================================
-- 32_fix_service_role_and_presence.sql
-- 1. Create Postgres role 'service' as alias to 'service_role' with BYPASSRLS
--    Fixes PostgREST error: role "service" does not exist
-- 2. Grant 'service' & 'service_role' to PostgREST 'authenticator' role
-- 3. Grant ALL schema and table permissions to 'service' and 'service_role'
-- 4. Ensure pb_user_presence is open to ALL users regardless of their role
--    (Super Admin, IT Ops Editor, Reviewer, IT Agent, Viewer, etc.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CREATE 'service' ROLE & BIND TO 'service_role' & 'authenticator'
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service') THEN
    CREATE ROLE service NOLOGIN NOINHERIT BYPASSRLS;
  ELSE
    ALTER ROLE service WITH BYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  ELSE
    ALTER ROLE service_role WITH BYPASSRLS;
  END IF;
END $$;

-- Allow authenticator (PostgREST connection user) to switch to service & service_role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    GRANT service TO authenticator;
    GRANT service_role TO authenticator;
    GRANT anon TO authenticator;
    GRANT authenticated TO authenticator;
  END IF;
END $$;

GRANT service_role TO service;
GRANT service TO service_role;

-- ----------------------------------------------------------------------------
-- 2. GRANT FULL PRIVILEGES TO 'service' AND 'service_role'
-- ----------------------------------------------------------------------------
GRANT ALL ON SCHEMA public TO service, service_role, postgres, supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service, service_role, postgres, supabase_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service, service_role, postgres, supabase_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service, service_role, postgres, supabase_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    GRANT USAGE ON SCHEMA auth TO service, service_role, anon, authenticated, postgres, supabase_admin;
    GRANT ALL ON ALL TABLES IN SCHEMA auth TO service, service_role, postgres, supabase_admin;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO service, service_role, postgres, supabase_admin;
    GRANT ALL ON ALL ROUTINES IN SCHEMA auth TO service, service_role, postgres, supabase_admin;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. UNRESTRICTED PRESENCE FOR ALL ROLES & USERS
-- ----------------------------------------------------------------------------
-- Ensure pb_user_presence exists with TEXT user_id
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

-- Drop any lingering foreign key so user presence never fails on FK checks
DO $$
BEGIN
  ALTER TABLE pb_user_presence DROP CONSTRAINT IF EXISTS pb_user_presence_user_id_fkey;
  ALTER TABLE pb_user_presence ALTER COLUMN user_id TYPE TEXT;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON pb_user_presence(last_seen_at);

-- Grant access to every possible role
GRANT ALL ON TABLE pb_user_presence TO authenticated, anon, service, service_role, postgres, supabase_admin;

ALTER TABLE pb_user_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all users to view presence" ON pb_user_presence;
CREATE POLICY "Allow all users to view presence" ON pb_user_presence
FOR SELECT TO authenticated, anon, service, service_role
USING (TRUE);

DROP POLICY IF EXISTS "Allow all users to upsert presence" ON pb_user_presence;
CREATE POLICY "Allow all users to upsert presence" ON pb_user_presence
FOR ALL TO authenticated, anon, service, service_role
USING (TRUE)
WITH CHECK (TRUE);

-- ----------------------------------------------------------------------------
-- 4. HEARTBEAT RPC - VISIBLE ACROSS ALL USERS AND ROLES (5-MINUTE WINDOW)
-- ----------------------------------------------------------------------------
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
  -- Upsert current user presence regardless of their role
  INSERT INTO pb_user_presence (user_id, display_name, email, role, photo_url, last_seen_at, updated_at)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_display_name), ''), split_part(p_email, '@', 1), 'User'),
    p_email,
    COALESCE(NULLIF(trim(p_role), ''), 'IT Support'),
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

  -- Clean up stale records older than 10 minutes
  DELETE FROM pb_user_presence WHERE last_seen_at < (now() - interval '10 minutes');

  -- Return all users active within 5 minutes (300 seconds)
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

GRANT EXECUTE ON FUNCTION record_presence_heartbeat(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon, service, service_role, postgres, supabase_admin;

CREATE OR REPLACE FUNCTION remove_presence_heartbeat(p_user_id TEXT)
RETURNS JSONB AS $$
BEGIN
  DELETE FROM pb_user_presence WHERE user_id = p_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION remove_presence_heartbeat(TEXT) TO authenticated, anon, service, service_role, postgres, supabase_admin;

-- Grant user management RPCs to service, service_role and all callers
GRANT EXECUTE ON FUNCTION admin_create_user(TEXT, TEXT, UUID, TEXT, UUID) TO authenticated, anon, service, service_role, postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION admin_update_user(UUID, TEXT, TEXT, UUID) TO authenticated, anon, service, service_role, postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION delete_user_account(UUID, UUID) TO authenticated, anon, service, service_role, postgres, supabase_admin;
