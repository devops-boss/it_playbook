-- ============================================================================
-- 30_fix_online_presence.sql
-- 1. Ensure pb_user_presence table exists with TEXT user_id and NO strict FK constraint
-- 2. Grant table permissions to authenticated, anon, service_role, postgres, supabase_admin
-- 3. Update record_presence_heartbeat RPC with 5-minute active window and TEXT p_user_id
-- 4. Enable RLS and permissive policies for all clients
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PB_USER_PRESENCE TABLE
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

-- Safely remove any foreign key constraint to auth.users if previously created
DO $$
BEGIN
  ALTER TABLE pb_user_presence DROP CONSTRAINT IF EXISTS pb_user_presence_user_id_fkey;
  ALTER TABLE pb_user_presence ALTER COLUMN user_id TYPE TEXT;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON pb_user_presence(last_seen_at);

-- ----------------------------------------------------------------------------
-- 2. TABLE GRANTS & RLS POLICIES
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3. HEARTBEAT RPC FUNCTIONS (5 MINUTE WINDOW)
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
  -- 1. Upsert current user presence
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

  -- 2. Clean up stale records older than 10 minutes
  DELETE FROM pb_user_presence WHERE last_seen_at < (now() - interval '10 minutes');

  -- 3. Return all users active within the last 5 minutes (300 seconds)
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

