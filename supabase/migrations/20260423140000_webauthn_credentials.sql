-- =============================================================================
-- WebAuthn Credentials + Challenges
--
-- Replaces the insecure "__BIOMETRIC_VERIFIED__" magic-token flow with proper
-- WebAuthn (FIDO2) credential registration and assertion verification.
--
-- webauthn_credentials:  one row per registered device per user
-- webauthn_challenges:   short-lived, one row per issued challenge
-- =============================================================================

-- Credentials: one row per registered platform authenticator per user
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id     text NOT NULL UNIQUE,   -- base64url-encoded credential ID from authenticator
  public_key        text NOT NULL,          -- base64url-encoded COSE public key
  counter           bigint NOT NULL DEFAULT 0,
  transports        text[] DEFAULT '{}'::text[],
  device_name       text,                    -- user-provided label e.g. "iPhone 15 Pro"
  aaguid            text,                    -- authenticator AAGUID (optional, for device identification)
  backup_eligible   boolean DEFAULT false,
  backup_state      boolean DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_used_at      timestamptz
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_user_id_idx
  ON public.webauthn_credentials(user_id);

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- Users can view their own credentials (for listing registered devices in Settings)
CREATE POLICY "Users can view own webauthn credentials"
  ON public.webauthn_credentials FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can delete their own credentials (remove a device)
CREATE POLICY "Users can delete own webauthn credentials"
  ON public.webauthn_credentials FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT/UPDATE is done by edge functions using service role only.
-- No RLS policy for INSERT/UPDATE for authenticated users (service role bypasses RLS).

-- Admins can view all credentials (for audit)
CREATE POLICY "Admins can view all webauthn credentials"
  ON public.webauthn_credentials FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));


-- Challenges: short-lived, action-bound. Deleted/expired after use.
--
-- "purpose" constrains what the resulting assertion can be used for:
--   - 'registration'        : used during credential enrollment
--   - 'approval'            : bound to a specific permit + role + action
--   - 'workflow_modify'     : bound to workflow modification
-- Binding data is stored in the `binding` JSONB so a challenge for permit A
-- cannot be replayed on permit B.
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose       text NOT NULL CHECK (purpose IN ('registration', 'approval', 'workflow_modify')),
  challenge     text NOT NULL,           -- base64url-encoded random bytes
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

-- Challenges are ONLY accessible via service role from edge functions.
-- No RLS policies for authenticated users = blocked by default.

-- Cleanup function for expired challenges (called opportunistically by edge fns,
-- or schedule via pg_cron if available).
CREATE OR REPLACE FUNCTION public.cleanup_expired_webauthn_challenges()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.webauthn_challenges
  WHERE expires_at < now() - interval '1 hour';
$$;


-- Extend signature_audit_logs with auth method + webauthn credential reference
-- (non-breaking addition).
ALTER TABLE public.signature_audit_logs
  ADD COLUMN IF NOT EXISTS auth_method text,
  ADD COLUMN IF NOT EXISTS webauthn_credential_id uuid REFERENCES public.webauthn_credentials(id) ON DELETE SET NULL;

-- Backfill auth_method for existing rows where possible (best-effort)
UPDATE public.signature_audit_logs
  SET auth_method = 'password'
  WHERE auth_method IS NULL;
