
-- 1. work_locations: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Users can view active work_locations" ON public.work_locations;
CREATE POLICY "Users can view active work_locations"
  ON public.work_locations FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 2. workflow_templates: drop public SELECT, keep authenticated-only
DROP POLICY IF EXISTS "Authenticated users can view active workflow_templates" ON public.workflow_templates;

-- 3. storage.objects: drop duplicate and tighten remaining INSERT policy
DROP POLICY IF EXISTS "Authenticated users can upload permit attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload permit attachments" ON storage.objects;

CREATE POLICY "Users can upload permit attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'permit-attachments'
    AND (
      EXISTS (
        SELECT 1 FROM public.work_permits wp
        WHERE wp.requester_id = auth.uid()
          AND (storage.foldername(name))[1] = wp.id::text
      )
      OR public.is_approver(auth.uid())
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );
