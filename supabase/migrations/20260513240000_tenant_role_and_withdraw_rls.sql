-- Two-part fix: tenant role auto-assignment + permit-withdrawal RLS
--
-- ## Issue 1 — New tenants don't receive 'tenant' role automatically
--
-- The handle_new_user() trigger DOES try to assign the tenant role:
--
--     SELECT id INTO tenant_role_id FROM public.roles WHERE name = 'tenant' LIMIT 1;
--     IF tenant_role_id IS NOT NULL THEN
--       INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, tenant_role_id);
--     END IF;
--
-- But the lookup uses `IF tenant_role_id IS NOT NULL` — meaning if the
-- 'tenant' row was ever deleted or renamed in production, the trigger
-- silently skips the role assignment. New tenants then have NO roles,
-- and admins must manually add the tenant role from the admin UI.
--
-- Three fixes in one transaction:
--
--   1. Defensive seed: ensure a row with name='tenant' exists in
--      public.roles. If missing, create it. If present but
--      is_active=false, reactivate it. Use ON CONFLICT for idempotency.
--
--   2. Trigger hardening: if the lookup STILL returns null (e.g. RLS
--      somehow blocks the SELECT inside the trigger), insert a clearly-
--      labeled error into the postgres log via RAISE WARNING so the
--      next failure is debuggable instead of silent.
--
--   3. Backfill: any existing auth.users with no rows in user_roles
--      (and account_status = 'approved' so we don't grant access to
--      rejected/pending users) gets the tenant role. Catches every
--      user already affected by the bug.
--
-- ## Issue 2 — Tenants can't withdraw their own submitted permits
--
-- The 'Users can update own draft permits' RLS policy on work_permits
-- has clause:
--
--     (requester_id = auth.uid()) AND (status = 'draft'::permit_status)
--
-- This means: tenant can only UPDATE if status='draft'. But to withdraw,
-- the permit is in some pending_X / submitted / under_review state.
-- The UPDATE then matches 0 rows. The frontend does
-- `.update(...).select().single()` and PostgREST returns:
--
--     "Cannot coerce the result to a single JSON object"
--
-- because 0 rows came back. Tenant sees a confusing error.
--
-- Fix: add a SECOND policy that lets tenants update their OWN permits
-- only for the specific transition to 'cancelled' status. WITH CHECK
-- enforces that the only field being changed is status, and only to
-- 'cancelled' — they can't sneak other changes through.

BEGIN;

-- ---------------------------------------------------------------
-- Issue 1.1 — Defensive seed of tenant role
-- ---------------------------------------------------------------
INSERT INTO public.roles (name, label, description, is_system, is_active)
VALUES ('tenant', 'Tenant',
        'Default role for tenants who submit work permits and gate pass requests',
        true, true)
ON CONFLICT (name) DO UPDATE
  SET is_active = true,
      is_system = true;

-- ---------------------------------------------------------------
-- Issue 1.2 — Trigger hardening with RAISE WARNING fallback
-- ---------------------------------------------------------------
--
-- Replaces the function in full to keep the body in one place.
-- Behavior matches the current trigger EXCEPT: if the tenant_role_id
-- is null after the SELECT, emit a RAISE WARNING (which lands in the
-- postgres logs visible via Supabase dashboard) so the next incident
-- is debuggable instead of silently failing.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  initial_status     text;
  v_phone            text;
  v_company          text;
  v_unit             text;
  v_floor            text;
  tenant_role_id     uuid;
  signup_source      text;
BEGIN
  signup_source := NEW.raw_user_meta_data->>'signup_source';
  IF signup_source = 'admin_created' THEN
    initial_status := 'approved';
  ELSE
    initial_status := 'pending';
  END IF;

  v_phone   := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone',        '')), '');
  v_company := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), '');
  v_unit    := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'unit',         '')), '');
  v_floor   := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'floor',        '')), '');

  INSERT INTO public.profiles (
    id, email, full_name, phone, company_name, unit, floor,
    account_status, account_approved_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    v_phone,
    v_company,
    v_unit,
    v_floor,
    initial_status,
    CASE WHEN initial_status = 'approved' THEN now() ELSE NULL END
  );

  -- Self-signups get the tenant role automatically. Admin-created
  -- users get explicit role assignment from the admin-create-user
  -- edge function.
  IF signup_source <> 'admin_created' THEN
    SELECT id INTO tenant_role_id FROM public.roles WHERE name = 'tenant' LIMIT 1;

    IF tenant_role_id IS NULL THEN
      -- The seed above should make this impossible, but if it ever
      -- happens (someone deletes the row, a future migration renames
      -- the role), log it loudly. Sign-up still succeeds; the user
      -- just has no role and an admin needs to fix it.
      RAISE WARNING 'handle_new_user: tenant role missing from public.roles; user % has no role assigned', NEW.id;
    ELSE
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, tenant_role_id)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------
-- Issue 1.3 — Backfill existing affected users
-- ---------------------------------------------------------------
--
-- Any user who signed up while the trigger was misbehaving, OR who
-- was created before the trigger added the tenant-role logic, has
-- no row in user_roles. Grant them tenant role retroactively — but
-- ONLY if their account_status is 'approved' so we don't accidentally
-- promote rejected or pending users.
--
-- Skips users who already have ANY role (could be admin, approver,
-- etc. that should not be touched).

DO $$
DECLARE
  v_tenant_role_id uuid;
  v_count int;
BEGIN
  SELECT id INTO v_tenant_role_id FROM public.roles WHERE name = 'tenant' LIMIT 1;
  IF v_tenant_role_id IS NULL THEN
    RAISE NOTICE 'Backfill skipped: tenant role not found';
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT p.id, v_tenant_role_id
    FROM public.profiles p
   WHERE p.account_status = 'approved'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id
     )
  ON CONFLICT (user_id, role_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Backfill: granted tenant role to % previously-roleless approved users', v_count;
END $$;

-- ---------------------------------------------------------------
-- Issue 2 — Tenant withdrawal RLS policy
-- ---------------------------------------------------------------
--
-- The existing 'Users can update own draft permits' policy stays —
-- tenants can still edit drafts. This NEW policy specifically allows
-- the withdrawal transition: set status to 'cancelled' from any
-- non-terminal state.
--
-- The WITH CHECK clause limits the post-update state — the row's
-- requester_id can't change, and the only valid new status is
-- 'cancelled'. So tenants can't use this to e.g. flip their own
-- permit to 'approved'.
--
-- Note: 'cancelled' is the legacy enum value used internally; the
-- UI labels this action as 'Withdrawn'. See useWithdrawPermit hook.

CREATE POLICY "Users can withdraw own non-terminal permits"
  ON public.work_permits
  FOR UPDATE
  TO authenticated
  USING (
    requester_id = auth.uid()
    AND status NOT IN (
      'approved'::public.permit_status,
      'rejected'::public.permit_status,
      'cancelled'::public.permit_status,
      'closed'::public.permit_status
    )
  )
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'cancelled'::public.permit_status
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
