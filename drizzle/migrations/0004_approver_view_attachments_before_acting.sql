DROP POLICY IF EXISTS "Approvers can view assigned permit attachments" ON public.permit_attachments;
CREATE POLICY "Approvers can view assigned permit attachments"
  ON public.permit_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.permit_approvals pa
      JOIN public.user_roles ur ON ur.role_id = pa.role_id
      WHERE pa.permit_id = permit_attachments.permit_id
        AND ur.user_id = auth.uid()
    )
  );