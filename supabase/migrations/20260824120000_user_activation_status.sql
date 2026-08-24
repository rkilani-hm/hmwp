-- Invited-user activation status + resend support.
--
-- Invited tenants are created (email pre-confirmed, no password) and emailed a
-- recovery link they use to onboard. That link expires, so admins need to see
-- who has actually activated and re-send a fresh link. "Activated" = has signed
-- in (auth.users.last_sign_in_at). "Invite expired" = not activated and the last
-- invite went out more than 24h ago (Supabase caps the email link lifetime at
-- 24h / 86400s, so that is the effective expiry window).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invitation_sent_at timestamptz;

-- Admin-only: per-user activation status. Reads auth.users, so SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.get_user_activation_status()
RETURNS TABLE (
  id uuid,
  activated boolean,
  last_sign_in_at timestamptz,
  invitation_sent_at timestamptz,
  invite_expired boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT u.id,
         (u.last_sign_in_at IS NOT NULL) AS activated,
         u.last_sign_in_at,
         p.invitation_sent_at,
         (u.last_sign_in_at IS NULL
            AND COALESCE(p.invitation_sent_at, u.created_at) < now() - interval '24 hours') AS invite_expired
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE public.has_role(auth.uid(), 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.get_user_activation_status() TO authenticated;
