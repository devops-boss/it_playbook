-- ============================================================================
-- BOS Playbook - Storage bucket + object policies
--
-- Problem: the editor stores scenario attachments in a private
-- 'scenario-attachments' bucket, but no migration ever creates that bucket
-- and no policies exist on storage.buckets / storage.objects. Both tables
-- have RLS enabled, so with zero policies every query returns no rows:
-- uploads came back 400 ("bucket not found") and reads came back empty.
-- The attachment feature was therefore broken end to end, even though
-- pb_attachments itself (the table pointing at the files) is protected
-- correctly by the scenario RLS from 06_rls.sql.
--
-- Fix: create the private bucket, then add policies that tie every storage
-- object back to its owning scenario. A caller may read, write or delete
-- an object only when their JWT proves they can view or manage that
-- scenario, so the files stay private even though the bucket is private
-- too. The helper functions below reuse the permission model already
-- defined in 06_rls.sql, so the storage rules cannot drift away from the
-- scenario rules.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create the private bucket the editor writes attachments into.
--    storage v1.81 keeps storage.buckets.id (text, primary key) equal to
--    the bucket name, so id and name coincide here. The file size limit
--    matches UPLOAD_MAX_SIZE as the stack configures it (10 MiB default).
-- ---------------------------------------------------------------------------
INSERT INTO "storage"."buckets"
  (id, name, owner, owner_id, public, allowed_mime_types, file_size_limit)
VALUES
  ('scenario-attachments', 'scenario-attachments', NULL, NULL, FALSE, ARRAY[
    'image/png',
    'image/jpeg',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/zip',
    'video/mp4',
    'audio/mpeg'
  ], 104857600)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 104857600;

-- ---------------------------------------------------------------------------
-- 2. Scenario access helpers.
--    can_view_scenario mirrors the "view scenarios" SELECT policy and
--    can_edit_scenario mirrors the "update scenarios" policy from
--    06_rls.sql. They are SECURITY DEFINER so they can read the scenario
--    and permission tables without the caller having rights on them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_scenario(p_scenario_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pb_scenarios s
    WHERE s.id = p_scenario_id
      AND s.deleted_at IS NULL
      AND (
        -- Super admin sees all
        is_super_admin()
        -- Published scenarios for accessible accounts
        OR (
          s.status = 'published'
          AND (
            s.is_global = TRUE
            OR s.account_id IS NULL
            OR has_account_access(s.account_id)
            OR EXISTS (
              SELECT 1
              FROM pb_scenario_accounts sa
              WHERE sa.scenario_id = s.id AND has_account_access(sa.account_id)
            )
          )
        )
        -- Editors can see their own drafts
        OR (s.created_by = auth.uid())
        -- Users with edit_any can see all non-deleted
        OR has_permission('edit_any_scenario')
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_edit_scenario(p_scenario_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pb_scenarios s
    WHERE s.id = p_scenario_id
      AND s.deleted_at IS NULL
      AND (
        is_super_admin()
        OR has_permission('edit_any_scenario')
        OR (s.created_by = auth.uid() AND has_permission('edit_own_scenario'))
        OR (s.status = 'draft' AND s.created_by = auth.uid())
        OR (s.status = 'pending_review' AND has_permission('review_scenario'))
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 3. Pull the scenario id out of an object path.
--    The editor writes objects as "<scenario_id>/<uuid>-<file name>", so the
--    first path segment identifies the owning scenario. A path that is not
--    of that shape has no scenario and therefore no access.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attachment_scenario_id(p_name TEXT)
RETURNS UUID AS $$
DECLARE
  v_first TEXT;
BEGIN
  v_first := split_part(coalesce(p_name, ''), '/', 1);
  IF v_first ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN v_first::uuid;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- 4. Bucket policies.
--    The storage API reads the bucket row as the requesting role, so an
--    authenticated user needs to be able to see the bucket, and the
--    anonymous key may only see buckets that are explicitly public.
-- ---------------------------------------------------------------------------
CREATE POLICY "authenticated can read buckets" ON storage.buckets
FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "anonymous can read public buckets" ON storage.buckets
FOR SELECT TO anon USING (public = TRUE);

-- ---------------------------------------------------------------------------
-- 5. Object policies.
--    Every operation is scoped to the scenario that owns the object, so a
--    file cannot be reached by anyone who cannot already reach the
--    scenario it belongs to.
-- ---------------------------------------------------------------------------
CREATE POLICY "attachment read allowed for scenario viewers" ON storage.objects
FOR SELECT TO authenticated
USING (
  public.can_view_scenario(public.attachment_scenario_id(name))
);

CREATE POLICY "attachment upload allowed for scenario editors" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  public.can_edit_scenario(public.attachment_scenario_id(name))
);

CREATE POLICY "attachment update allowed for scenario editors" ON storage.objects
FOR UPDATE TO authenticated
USING (
  public.can_edit_scenario(public.attachment_scenario_id(name))
)
WITH CHECK (
  public.can_edit_scenario(public.attachment_scenario_id(name))
);

CREATE POLICY "attachment delete allowed for scenario editors" ON storage.objects
FOR DELETE TO authenticated
USING (
  public.can_edit_scenario(public.attachment_scenario_id(name))
);

-- ---------------------------------------------------------------------------
-- 6. Grants.
--    The anon and authenticated roles need to reach the storage tables
--    directly; the storage API connects as supabase_storage_admin and
--    switches to the request role for these reads and writes.
-- ---------------------------------------------------------------------------
GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA storage TO authenticated;
