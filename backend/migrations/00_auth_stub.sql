-- ============================================================================
-- BOS Playbook - Auth Schema Stub
-- In production, `auth` is provided by Supabase GoTrue.
-- This file exists only so migrations can be applied to a plain Postgres
-- instance for local testing / CI. It is NOT used by the Docker stack.
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  encrypted_password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', TRUE), '')::UUID;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', TRUE), ''), 'anon');
$$ LANGUAGE sql STABLE;

-- The anon/authenticated/service_role roles that Supabase provisions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;
