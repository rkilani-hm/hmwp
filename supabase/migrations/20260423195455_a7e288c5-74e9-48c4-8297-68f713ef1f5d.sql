-- Migration 1/3: WebAuthn credentials + challenges
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id     text NOT NULL UNIQUE,
  public_key        text NOT NULL,
  counter           bigint NOT NULL DEFAULT 0,
  transports        text[] DEFAULT '{}'::text[],
  device_name       text,
  aaguid            text,
  backup_eligible   boolean DEFAULT false,
  backup_state      boolean DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_used_at      timestamptz
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_user_id_idx
  ON public.webauthn_credentials(user_id);

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own webauthn credentials"
  ON public.webauthn_credentials FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own webauthn credentials"
  ON public.webauthn_credentials FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all webauthn credentials"
  ON public.webauthn_credentials FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose       text NOT NULL CHECK (purpose IN ('registration', 'approval', 'workflow_modify')),
  challenge     text NOT NULL,
  binding       jsonb NOT NULL DEFAULT '{}'::jsonb,
  consumed      boolean NOT NULL DEFAULT false,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_challenges_user_id_idx
  ON public.webauthn_challenges(user_id);
CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_at_idx
  ON public.webauthn_challenges(expires_at);

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cleanup_expired_webauthn_challenges()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.webauthn_challenges
  WHERE expires_at < now() - interval '1 hour';
$$;

ALTER TABLE public.signature_audit_logs
  ADD COLUMN IF NOT EXISTS auth_method text,
  ADD COLUMN IF NOT EXISTS webauthn_credential_id uuid REFERENCES public.webauthn_credentials(id) ON DELETE SET NULL;

UPDATE public.signature_audit_logs
  SET auth_method = 'password'
  WHERE auth_method IS NULL;