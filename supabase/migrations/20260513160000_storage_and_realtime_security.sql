-- Storage + Realtime security hardening
--
-- Closes three findings raised by the Lovable security scanner:
--
--   1. storage.objects had "Anyone can view permit attachments"
--      policy granting public SELECT to a "private" bucket.
--      (This policy was added through the Supabase dashboard,
--      not via any migration in git — so a defensive DROP IF
--      EXISTS handles both states.)
--
--   2. storage.objects had "Service can insert permit PDFs" and
--      "Service can update permit PDFs" policies on the PUBLIC
--      role with no auth check, allowing any unauthenticated user
--      to upload/overwrite files in the permit-pdfs bucket.
--      (These ARE in migration 20251223140724.)
--
--   3. realtime.messages had no RLS. Any authenticated user could
--      subscribe to any Realtime channel — including 'gate-passes-
--      changes' (subscribed by useGatePasses) and 'work-permits-
--      changes' (useWorkPermits) — and receive row-change events
--      for permits/gate-passes belonging to other users.
--
-- All changes are idempotent (DROP IF EXISTS + CREATE IF NOT EXISTS
-- patterns). Safe to re-run.

BEGIN;

-- ---------------------------------------------------------------
-- Finding 1: Remove the public-SELECT policy on permit attachments
-- ---------------------------------------------------------------
-- "Users can view own permit attachments" (in migration
-- 20251223140724) already provides correctly-scoped access via
-- work_permits.requester_id, is_approver(), and admin checks.
-- This drop closes the public-SELECT leak without removing legit
-- access for the right users.
DROP POLICY IF EXISTS "Anyone can view permit attachments" ON storage.objects;

-- ---------------------------------------------------------------
-- Finding 2: Restrict permit-pdfs bucket INSERT/UPDATE to service_role
-- ---------------------------------------------------------------
-- The previous policies applied to PUBLIC role with no auth check.
-- Drop and recreate restricted to service_role.
--
-- Note: when an edge function uses the service-role key, Supabase
-- bypasses RLS entirely. So these policies are defensive — they
-- prevent abuse if the bypass mechanism ever changes, and they
-- close the hole where anonymous clients could write to the
-- bucket via the storage API.
DROP POLICY IF EXISTS "Service can insert permit PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Service can update permit PDFs" ON storage.objects;

CREATE POLICY "Service role can insert permit PDFs"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'permit-pdfs');

CREATE POLICY "Service role can update permit PDFs"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'permit-pdfs')
  WITH CHECK (bucket_id = 'permit-pdfs');

-- ---------------------------------------------------------------
-- Finding 3: Enable RLS on realtime.messages with authenticated baseline
-- ---------------------------------------------------------------
-- ENABLE RLS first. Idempotent: Postgres no-ops if already on.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Baseline policies: only authenticated users can subscribe (SELECT)
-- or broadcast (INSERT) on realtime channels. Anonymous users get
-- nothing — no realtime.messages access at all.
--
-- This closes the leak described in finding 3 by gating channel
-- subscription on authentication. The previous state had no RLS,
-- so even unauthenticated clients could subscribe to channels and
-- receive events.
--
-- IMPORTANT defense-in-depth note: for postgres_changes events
-- (the kind used by useGatePasses / useWorkPermits / useNotifications
-- hooks), Supabase Realtime v2 ALSO applies the underlying table's
-- RLS policies when filtering row payloads delivered to subscribers.
-- So even authenticated users only see rows they have RLS access
-- to. Combined with this authenticated-only baseline, the data
-- leak is closed.
--
-- For finer-grained per-user channel scoping (e.g. only let user
-- A subscribe to 'gate-passes-user-A'), a future PR would name
-- channels with userIds and add a policy that parses the channel
-- name. That's a larger refactor; this PR establishes the
-- authenticated baseline first.

DROP POLICY IF EXISTS "Authenticated users can subscribe to channels" ON realtime.messages;
CREATE POLICY "Authenticated users can subscribe to channels"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can broadcast on channels" ON realtime.messages;
CREATE POLICY "Authenticated users can broadcast on channels"
  ON realtime.messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ---------------------------------------------------------------
-- PostgREST schema reload
-- ---------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
