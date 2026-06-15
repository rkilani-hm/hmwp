-- Backfill: any approved profile lacking a user_roles entry gets the 'tenant' role.
INSERT INTO public.user_roles (user_id, role_id)
SELECT p.id, (SELECT id FROM public.roles WHERE name='tenant' LIMIT 1)
FROM public.profiles p
LEFT JOIN public.user_roles ur ON ur.user_id = p.id
WHERE p.account_status = 'approved'
  AND ur.user_id IS NULL
  AND EXISTS (SELECT 1 FROM public.roles WHERE name='tenant')
ON CONFLICT (user_id, role_id) DO NOTHING;