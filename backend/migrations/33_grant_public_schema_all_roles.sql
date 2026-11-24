-- ============================================================================
-- 33_grant_public_schema_all_roles.sql
-- 1. Ensure schema public is owned by postgres and granted to all application roles
--    Fixes "permission denied for schema public"
-- 2. Grant USAGE, CREATE on schema public to:
--    postgres, supabase_admin, service_role, service, authenticated, anon, authenticator, public
-- 3. Grant ALL on all existing and future tables, sequences and routines in schema public
-- 4. Re-grant presence and user management RPCs to all roles
-- ============================================================================

DO $$
BEGIN
  -- 1. Create service & service_role roles if not exists with BYPASSRLS
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

  -- 2. Allow authenticator to switch to all roles
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    GRANT service TO authenticator;
    GRANT service_role TO authenticator;
    GRANT anon TO authenticator;
    GRANT authenticated TO authenticator;
  END IF;
END $$;

-- 3. Ensure schema public ownership and unrestricted grants
ALTER SCHEMA public OWNER TO postgres;

GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO supabase_admin;
GRANT ALL ON SCHEMA public TO service_role;
GRANT ALL ON SCHEMA public TO service;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticator;
GRANT ALL ON SCHEMA public TO public;

GRANT USAGE, CREATE ON SCHEMA public TO postgres, supabase_admin, service_role, service, authenticated, anon, authenticator, public;

-- 4. Table, sequence, routine privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, supabase_admin, service_role, service, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, supabase_admin, service_role, service, authenticated;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO postgres, supabase_admin, service_role, service, authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Default privileges for future objects created by postgres or supabase_admin
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres, supabase_admin, service_role, service, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, supabase_admin, service_role, service, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, supabase_admin, service_role, service, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres, supabase_admin, service_role, service, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, supabase_admin, service_role, service, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, supabase_admin, service_role, service, authenticated;

-- 5. Explicit grants on pb_user_presence and user management RPCs
GRANT ALL ON TABLE pb_user_presence TO postgres, supabase_admin, service_role, service, authenticated, anon;
GRANT EXECUTE ON FUNCTION record_presence_heartbeat(TEXT, TEXT, TEXT, TEXT, TEXT) TO postgres, supabase_admin, service_role, service, authenticated, anon, public;
GRANT EXECUTE ON FUNCTION remove_presence_heartbeat(TEXT) TO postgres, supabase_admin, service_role, service, authenticated, anon, public;
GRANT EXECUTE ON FUNCTION admin_create_user(TEXT, TEXT, UUID, TEXT, UUID) TO postgres, supabase_admin, service_role, service, authenticated, anon, public;
GRANT EXECUTE ON FUNCTION admin_update_user(UUID, TEXT, TEXT, UUID) TO postgres, supabase_admin, service_role, service, authenticated, anon, public;
GRANT EXECUTE ON FUNCTION delete_user_account(UUID, UUID) TO postgres, supabase_admin, service_role, service, authenticated, anon, public;

