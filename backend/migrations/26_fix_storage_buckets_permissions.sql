-- ============================================================================
-- 26_fix_storage_buckets_permissions.sql
-- Fix: Grant full permissions on storage schema, tables, and sequences
-- to authenticated, anon, service_role, postgres, supabase_admin, supabase_storage_admin.
-- Also add universal bucket read/write RLS policies so uploads never fail with 42501.
-- ============================================================================

-- 1. Ensure schemas and grants
GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated, service_role, supabase_admin, supabase_storage_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA storage TO postgres, anon, authenticated, service_role, supabase_admin, supabase_storage_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA storage TO postgres, anon, authenticated, service_role, supabase_admin, supabase_storage_admin;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA storage TO postgres, anon, authenticated, service_role, supabase_admin, supabase_storage_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role, supabase_admin, supabase_storage_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role, supabase_admin, supabase_storage_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role, supabase_admin, supabase_storage_admin;

-- 2. Explicit grants on storage.buckets and storage.objects
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.buckets TO anon, authenticated, service_role, postgres, supabase_admin, supabase_storage_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role, postgres, supabase_admin, supabase_storage_admin;

-- 3. Bucket existence & RLS policies
INSERT INTO storage.buckets (id, name, owner, owner_id, public, allowed_mime_types, file_size_limit)
VALUES ('scenario-attachments', 'scenario-attachments', NULL, NULL, TRUE, NULL, 104857600)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  allowed_mime_types = NULL,
  file_size_limit = 104857600;

-- Ensure RLS policies on storage.buckets allow reading and inserting
DROP POLICY IF EXISTS "allow_read_buckets" ON storage.buckets;
CREATE POLICY "allow_read_buckets" ON storage.buckets
FOR SELECT TO public
USING (true);

DROP POLICY IF EXISTS "allow_insert_buckets" ON storage.buckets;
CREATE POLICY "allow_insert_buckets" ON storage.buckets
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- Ensure RLS policies on storage.objects allow authenticated users to upload and download
DROP POLICY IF EXISTS "attachment upload allowed for scenario editors" ON storage.objects;
DROP POLICY IF EXISTS "attachment upload allowed for all authenticated" ON storage.objects;
CREATE POLICY "attachment upload allowed for all authenticated" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'scenario-attachments'
);

DROP POLICY IF EXISTS "attachment read allowed for scenario viewers" ON storage.objects;
DROP POLICY IF EXISTS "attachment read allowed for all authenticated" ON storage.objects;
CREATE POLICY "attachment read allowed for all authenticated" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'scenario-attachments'
);

DROP POLICY IF EXISTS "attachment read allowed for anon" ON storage.objects;
CREATE POLICY "attachment read allowed for anon" ON storage.objects
FOR SELECT TO anon
USING (
  bucket_id = 'scenario-attachments'
);

DROP POLICY IF EXISTS "attachment update allowed for scenario editors" ON storage.objects;
DROP POLICY IF EXISTS "attachment update allowed for all authenticated" ON storage.objects;
CREATE POLICY "attachment update allowed for all authenticated" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'scenario-attachments'
);

DROP POLICY IF EXISTS "attachment delete allowed for scenario editors" ON storage.objects;
DROP POLICY IF EXISTS "attachment delete allowed for all authenticated" ON storage.objects;
CREATE POLICY "attachment delete allowed for all authenticated" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'scenario-attachments'
);

