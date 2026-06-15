
CREATE TABLE public.public_submission_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_public_submission_log_ip_created ON public.public_submission_log (ip, created_at DESC);

GRANT ALL ON public.public_submission_log TO service_role;

ALTER TABLE public.public_submission_log ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (bypasses RLS) may access.

DROP POLICY IF EXISTS "Allow anonymous internal permit creation" ON public.work_permits;
