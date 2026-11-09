-- ============================================================================
-- BOS Playbook - Postgres bootstrap
--
-- This file runs once, the first time the database container starts with an
-- empty data directory. It is mounted into the container's
-- /docker-entrypoint-initdb.d/ directory by docker-compose.yml.
--
-- The supabase/postgres image already ships the Supabase roles, the auth
-- and storage schemas and a set of extensions, so most of this file only
-- has to make sure the things BOS Playbook depends on are present and
-- reachable. Everything here is written to be safe to run against either
-- the Supabase image or a plain postgres image, and safe to run twice.
--
-- The application migrations (backend/migrations/*.sql) are NOT run from
-- here. They are applied by scripts/migrate.sh, which records what has been
-- applied in the pb_migrations table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The application roles
--
-- Supabase provisions anon, authenticated and service_role. If a plain
-- postgres image is used instead, they are created here. The service role
-- bypasses row level security, so it is only ever used by trusted server
-- side jobs - never by the browser.
-- ---------------------------------------------------------------------------
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

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. The extensions
--
-- pg_trgm carries the typo tolerance of the search, pgcrypto the
-- identifiers, and btree_gin the compound indexes that mix a scalar column
-- with an array of values.
--
-- They are moved into the public schema when they are found somewhere else.
-- The reason is the search_path of the application functions: they are
-- declared as SECURITY DEFINER with `SET search_path = public, pg_temp`,
-- which is what stops a caller from hijacking a function call by creating
-- a shadow object in a schema of their own. That same setting means the
-- trigram operators have to live in public, or similarity() would not
-- resolve inside them.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gin;

DO $$
DECLARE
  ext RECORD;
BEGIN
  FOR ext IN
    SELECT e.extname, n.nspname AS current_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('pg_trgm', 'pgcrypto', 'btree_gin')
      AND n.nspname <> 'public'
  LOOP
    EXECUTE format('ALTER EXTENSION %I SET SCHEMA public', ext.extname);
    RAISE NOTICE 'moved extension % from % to public', ext.extname, ext.current_schema;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. The search path
--
-- public comes first, so the trigram operators resolve, and extensions is
-- kept in the path for anything the Supabase image installs there.
-- ---------------------------------------------------------------------------
ALTER DATABASE postgres SET search_path = "$user", public, extensions;

-- ---------------------------------------------------------------------------
-- 4. The schemas
--
-- auth and storage are created by the Supabase image. They are created here
-- as well so that the application can be run against a plain postgres image
-- for a quick trial. The tables inside them are the responsibility of GoTrue
-- and the storage service, not of this file.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- The storage service writes through its own role.
GRANT ALL ON SCHEMA storage TO supabase_storage_admin;

-- ---------------------------------------------------------------------------
-- 5. The default privileges
--
-- Anything the migrations create later is readable by the three roles. The
-- row level policies, applied by backend/migrations/06_rls.sql, are what
-- actually decide which rows a given user may see; these grants only make
-- the tables reachable at all.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. A note on what is NOT here
--
-- There is no password for the application roles, and no shared secret in
-- this file. The anon and service keys are JWTs signed with the JWT secret
-- from .env, generated by scripts/generate-secrets.sh. The roles themselves
-- are switched into by the PostgREST connection role, not by a password.
-- ============================================================================
