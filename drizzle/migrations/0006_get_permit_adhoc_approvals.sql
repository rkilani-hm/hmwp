CREATE OR REPLACE FUNCTION public.get_permit_adhoc_approvals(p_permit_id uuid)
RETURNS TABLE(id uuid, permit_id uuid, requested_by_user_id uuid, requested_by_name text, requested_by_role text,
              target_user_id uuid, target_name text, target_role text, target_role_label text, status text,
              request_note text, comments text, signature text, auth_method text, approved_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.permit_id, a.requested_by_user_id, COALESCE(rp.full_name, rp.email), a.requested_by_role,
         a.target_user_id, COALESCE(tp.full_name, tp.email), a.target_role, COALESCE(r.label, a.target_role), a.status,
         a.request_note, a.comments, a.signature, a.auth_method, a.approved_at, a.created_at
  FROM public.permit_adhoc_approvals a
  LEFT JOIN public.profiles rp ON rp.id = a.requested_by_user_id
  LEFT JOIN public.profiles tp ON tp.id = a.target_user_id
  LEFT JOIN public.roles r ON r.name = a.target_role
  WHERE a.permit_id = p_permit_id
    AND (public.has_role(auth.uid(), 'admin'::app_role)
         OR a.requested_by_user_id = auth.uid() OR a.target_user_id = auth.uid()
         OR public.is_approver(auth.uid())
         OR EXISTS (SELECT 1 FROM public.work_permits wp WHERE wp.id = a.permit_id AND wp.requester_id = auth.uid()))
  ORDER BY a.created_at;
$$;
REVOKE ALL ON FUNCTION public.get_permit_adhoc_approvals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_permit_adhoc_approvals(uuid) TO authenticated;