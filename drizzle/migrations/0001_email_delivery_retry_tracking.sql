ALTER TABLE public.email_delivery_logs
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS throttle_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_status_code integer,
  ADD COLUMN IF NOT EXISTS attempt_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
UPDATE public.email_delivery_logs SET delivered_at = created_at WHERE status = 'sent' AND delivered_at IS NULL;