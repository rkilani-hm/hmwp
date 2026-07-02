-- Email delivery audit log
--
-- Records the outcome of every email the system attempts to send through the
-- send-email-notification edge function (Microsoft Graph). One row per send
-- attempt (a single Graph call can target multiple recipients — they all
-- succeed or fail together, so one row captures the outcome).
--
-- Purpose: let admins verify that tenants and approvers actually receive the
-- notifications the system sends (approval requests, approvals, rejections,
-- account-status emails, SLA alerts). Failures that previously only surfaced
-- in edge-function console logs are now queryable.
--
-- Writes come exclusively from the edge function using the service-role key,
-- which bypasses RLS. Reads are restricted to admins.

CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  notification_type text,                       -- e.g. approval_required, approved, account_approved
  recipients        text[] NOT NULL DEFAULT '{}',
  recipient_count   integer NOT NULL DEFAULT 0,
  subject           text,
  permit_id         uuid,                        -- work permit / gate pass context, when present
  permit_no         text,
  status            text NOT NULL,               -- 'sent' | 'failed'
  error_message     text,                        -- populated when status = 'failed'
  provider          text NOT NULL DEFAULT 'microsoft_graph',
  duration_ms       integer,                     -- time spent on the provider call
  CONSTRAINT email_delivery_logs_status_check CHECK (status IN ('sent', 'failed'))
);

ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read the log. Inserts come from the service role (RLS-exempt);
-- no authenticated user should insert/update/delete these audit rows.
DROP POLICY IF EXISTS "Admins can read email_delivery_logs" ON public.email_delivery_logs;
CREATE POLICY "Admins can read email_delivery_logs"
ON public.email_delivery_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_created_at
  ON public.email_delivery_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_status
  ON public.email_delivery_logs (status);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_permit_id
  ON public.email_delivery_logs (permit_id);
