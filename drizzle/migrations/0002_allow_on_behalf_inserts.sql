DROP POLICY IF EXISTS "Users can create permits" ON public.work_permits;
CREATE POLICY "Users can create permits" ON public.work_permits FOR INSERT TO authenticated
WITH CHECK (
  public.current_user_account_status() = 'approved'
  AND (
    (requester_id = auth.uid() AND created_on_behalf_by IS NULL)
    OR (created_on_behalf_by = auth.uid() AND public.can_submit_on_behalf(auth.uid()))
  )
);
DROP POLICY IF EXISTS "Users can create gate passes" ON public.gate_passes;
CREATE POLICY "Users can create gate passes" ON public.gate_passes FOR INSERT TO authenticated
WITH CHECK (
  public.current_user_account_status() = 'approved'
  AND (
    (requester_id = auth.uid() AND created_on_behalf_by IS NULL)
    OR (created_on_behalf_by = auth.uid() AND public.can_submit_on_behalf(auth.uid()))
  )
);