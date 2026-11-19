-- ============================================================================
-- 24_allow_all_attachment_types.sql
-- Allow all file types (png, jpg, pdf, txt, log, docx, xlsx, pcap, any form)
-- and ensure full downloadability and step-image access.
-- ============================================================================

-- 1. Remove MIME type restrictions on scenario-attachments bucket so ALL file formats can be uploaded
UPDATE storage.buckets
SET allowed_mime_types = NULL,
    file_size_limit = 104857600
WHERE id = 'scenario-attachments';

INSERT INTO storage.buckets (id, name, owner, owner_id, public, allowed_mime_types, file_size_limit)
VALUES ('scenario-attachments', 'scenario-attachments', NULL, NULL, FALSE, NULL, 104857600)
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = NULL,
  file_size_limit = 104857600;

-- 2. Update storage.objects policies to allow resolution-steps uploads and reads
DROP POLICY IF EXISTS "attachment upload allowed for scenario editors" ON storage.objects;
CREATE POLICY "attachment upload allowed for scenario editors" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  public.can_edit_scenario(public.attachment_scenario_id(name))
  OR name LIKE 'resolution-steps/%'
);

DROP POLICY IF EXISTS "attachment read allowed for scenario viewers" ON storage.objects;
CREATE POLICY "attachment read allowed for scenario viewers" ON storage.objects
FOR SELECT TO authenticated
USING (
  public.can_view_scenario(public.attachment_scenario_id(name))
  OR name LIKE 'resolution-steps/%'
);

DROP POLICY IF EXISTS "attachment delete allowed for scenario editors" ON storage.objects;
CREATE POLICY "attachment delete allowed for scenario editors" ON storage.objects
FOR DELETE TO authenticated
USING (
  public.can_edit_scenario(public.attachment_scenario_id(name))
  OR name LIKE 'resolution-steps/%'
);
