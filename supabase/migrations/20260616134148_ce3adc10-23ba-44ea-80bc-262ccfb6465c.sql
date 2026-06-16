
-- =========================================================================
-- WhatsApp foundation schema
-- =========================================================================

-- 1. wa_sessions
CREATE TABLE public.wa_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'idle',
  collected_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  lang text NOT NULL DEFAULT 'en',
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_sessions IS
  'One WhatsApp conversation per phone. Service-role-only access. The orchestrator manages "latest active" — we deliberately do NOT enforce a partial-unique-per-phone constraint because terminal states (submitted/cancelled) are kept for audit and we want a simple plain index on phone instead.';

CREATE INDEX wa_sessions_phone_idx ON public.wa_sessions (phone);
CREATE INDEX wa_sessions_expires_at_idx ON public.wa_sessions (expires_at);

GRANT ALL ON public.wa_sessions TO service_role;

ALTER TABLE public.wa_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS; no other role may touch it.

-- updated_at trigger (reuses the existing project helper)
CREATE TRIGGER trg_wa_sessions_set_updated_at
  BEFORE UPDATE ON public.wa_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2. wa_messages
CREATE TABLE public.wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NULL REFERENCES public.wa_sessions(id) ON DELETE SET NULL,
  phone text NOT NULL,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  body text NULL,
  media_ref text NULL,
  media_type text NULL,
  wa_message_id text NULL,
  permit_id uuid NULL REFERENCES public.work_permits(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_messages IS
  'Full audit log of inbound/outbound WhatsApp messages. media_ref points to permit-attachments bucket — never store raw bytes here.';

CREATE INDEX wa_messages_session_created_idx ON public.wa_messages (session_id, created_at);
CREATE INDEX wa_messages_phone_created_idx   ON public.wa_messages (phone, created_at);
CREATE INDEX wa_messages_wa_message_id_idx   ON public.wa_messages (wa_message_id);

GRANT ALL ON public.wa_messages TO service_role;
-- Admin read access for transcript viewing in the UI.
GRANT SELECT ON public.wa_messages TO authenticated;

ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view WhatsApp transcripts"
  ON public.wa_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.user_id = auth.uid()
         AND r.name = 'admin'
    )
  );


-- 3. wa_action_tokens
CREATE TABLE public.wa_action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  permit_id uuid NOT NULL REFERENCES public.work_permits(id) ON DELETE CASCADE,
  approver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_action_tokens IS
  'Single-use, expiring tokens binding a WhatsApp approve/reject tap to a specific approver+permit. Service-role-only access.';

CREATE INDEX wa_action_tokens_permit_idx ON public.wa_action_tokens (permit_id);
CREATE INDEX wa_action_tokens_approver_expires_idx ON public.wa_action_tokens (approver_user_id, expires_at);

GRANT ALL ON public.wa_action_tokens TO service_role;

ALTER TABLE public.wa_action_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS.


-- 4. work_permits.source provenance column
ALTER TABLE public.work_permits
  ADD COLUMN source text NOT NULL DEFAULT 'web';

ALTER TABLE public.work_permits
  ADD CONSTRAINT work_permits_source_check
  CHECK (source IN ('web','whatsapp','public'));

COMMENT ON COLUMN public.work_permits.source IS
  'Permit provenance: web (in-app wizard), whatsapp (WA orchestrator), public (anonymous /request-permit intake).';
