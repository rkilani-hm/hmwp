DROP POLICY IF EXISTS "Approvers can view assigned permit attachments" ON public.permit_attachments;

CREATE POLICY "Approvers can view assigned permit attachments"
ON public.permit_attachments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.permit_approvals pa
    WHERE pa.permit_id = permit_attachments.permit_id
      AND pa.approver_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authenticated users can read permit PDFs" ON storage.objects;

ALTER PUBLICATION supabase_realtime DROP TABLE public.gate_passes;

CREATE POLICY "Users can insert own webauthn credentials"
ON public.webauthn_credentials
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own webauthn challenges"
ON public.webauthn_challenges
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own webauthn challenges"
ON public.webauthn_challenges
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());