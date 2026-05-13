
DROP POLICY IF EXISTS "Users can insert own permit attachments" ON public.permit_attachments;

CREATE POLICY "Requesters and approvers can insert permit attachments"
ON public.permit_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.work_permits wp
    WHERE wp.id = permit_attachments.permit_id
      AND wp.requester_id = auth.uid()
  )
  OR public.is_approver(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);
