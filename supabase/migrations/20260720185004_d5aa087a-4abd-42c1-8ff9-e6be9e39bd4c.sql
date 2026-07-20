
-- Backfill user_activity_logs from historical activity_logs
INSERT INTO public.user_activity_logs (user_id, user_email, action_type, details, user_agent, created_at)
SELECT
  al.performed_by_id,
  COALESCE(p.email, al.performed_by, 'unknown'),
  CASE
    WHEN al.action ILIKE '%Approved%' AND al.action NOT ILIKE '%Emailed%' AND al.action NOT ILIKE '%Distributed%' THEN 'permit_approve'
    WHEN al.action ILIKE '%Rejected%' THEN 'permit_reject'
    WHEN al.action ILIKE '%Reviewed%' THEN 'permit_action'
    WHEN al.action = 'Forwarded' THEN 'permit_forward'
    WHEN al.action = 'Rework Requested' THEN 'permit_rework'
    WHEN al.action = 'Permit Created' THEN 'permit_create'
    WHEN al.action = 'Work Schedule Changed' THEN 'permit_amend'
    WHEN al.action ILIKE '%Cancel%' THEN 'permit_cancel'
    WHEN al.action ILIKE '%Comment%' THEN 'comment_added'
    ELSE 'permit_action'
  END,
  COALESCE(al.details, al.action),
  NULL,
  al.created_at
FROM public.activity_logs al
LEFT JOIN public.profiles p ON p.id = al.performed_by_id
WHERE al.performed_by_id IS NOT NULL
  AND al.action NOT IN ('Approved Permit Emailed','Approved Permit Distributed','Email Notification Sent','Notifications Resent')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_activity_logs ual
    WHERE ual.user_id = al.performed_by_id
      AND ual.created_at = al.created_at
      AND ual.details = COALESCE(al.details, al.action)
  );
