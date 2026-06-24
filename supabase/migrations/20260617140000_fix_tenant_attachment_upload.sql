-- =============================================================================
-- Fix tenant permit-attachment upload          spec: specs/fix-tenant-attachment-upload.md
-- =============================================================================
--
-- Tenants could not submit a Work Permit with attachments — the upload failed
-- with "new row violates row-level security policy". Root cause: files are
-- uploaded BEFORE the work_permits row exists, into a random tempId folder, but
-- the storage INSERT policy required the first path segment to equal an EXISTING
-- work_permits.id owned by the caller. Only admins/approvers passed (via their
-- own branches), so only tenants/non-admins hit the error.
--
-- Fix A (chosen): key the attachment folder on the uploader's auth.uid(), the
-- same proven ownership model already used by the working company-logos
-- policies. The frontend now uploads to `${user.id}/<file>` (see useCreatePermit
-- and useUpdateAndResubmitPermit). These policies align with that.
--
-- Confidentiality is preserved: the requester-facing branch on INSERT/SELECT/
-- DELETE is gated by (storage.foldername(name))[1] = auth.uid()::text, so a
-- caller can only touch their own folder. Approver/admin branches are kept so
-- internal staff submitting on behalf of others — and PDF/detail reads of any
-- permit's (incl. historical) attachments — keep working.
-- =============================================================================

BEGIN;

-- R2. INSERT — ownership by uploader folder, OR approver/admin.
DROP POLICY IF EXISTS "Users can upload permit attachments" ON storage.objects;
CREATE POLICY "Users can upload permit attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'permit-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_approver(auth.uid())
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- R3. SELECT — requester reads their own auth.uid() folder; approver/admin read
-- any (covers PDF generation, permit detail, and historical files under old
-- tempId/permitId folders).
DROP POLICY IF EXISTS "Users can view own permit attachments" ON storage.objects;
CREATE POLICY "Users can view own permit attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'permit-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_approver(auth.uid())
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- R4. DELETE — requester deletes only their own folder; admin retained for
-- cleanup/management.
DROP POLICY IF EXISTS "Users can delete their own permit attachments" ON storage.objects;
CREATE POLICY "Users can delete their own permit attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'permit-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
