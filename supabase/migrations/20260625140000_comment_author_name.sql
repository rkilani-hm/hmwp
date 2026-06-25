-- =============================================================================
-- Snapshot author_name on comments (fix "Unknown user")
-- =============================================================================
-- profiles RLS only lets a user read their OWN profile, so the client-side
-- author-name lookup returned nothing for other authors -> "Unknown user".
-- Denormalize the author's display name onto the comment row (set by the
-- SECURITY DEFINER insert trigger, which can read profiles), matching how the
-- app already snapshots names elsewhere (permit_approvals.approver_name,
-- activity_logs.performed_by). Applies to both permit and gate-pass comments.
-- =============================================================================

BEGIN;

ALTER TABLE public.permit_comments    ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.gate_pass_comments ADD COLUMN IF NOT EXISTS author_name text;

CREATE OR REPLACE FUNCTION public.permit_comments_set_dept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  NEW.author_id := COALESCE(NEW.author_id, auth.uid());
  NEW.author_department_id := public.get_user_department(NEW.author_id);
  IF NEW.author_name IS NULL THEN
    SELECT COALESCE(NULLIF(btrim(p.full_name), ''), p.email)
      INTO NEW.author_name FROM public.profiles p WHERE p.id = NEW.author_id;
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.gate_pass_comments_set_dept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  NEW.author_id := COALESCE(NEW.author_id, auth.uid());
  NEW.author_department_id := public.get_user_department(NEW.author_id);
  IF NEW.author_name IS NULL THEN
    SELECT COALESCE(NULLIF(btrim(p.full_name), ''), p.email)
      INTO NEW.author_name FROM public.profiles p WHERE p.id = NEW.author_id;
  END IF;
  RETURN NEW;
END $fn$;

-- Backfill existing rows.
UPDATE public.permit_comments c
   SET author_name = COALESCE(NULLIF(btrim(p.full_name), ''), p.email)
  FROM public.profiles p
 WHERE p.id = c.author_id AND c.author_name IS NULL;

UPDATE public.gate_pass_comments c
   SET author_name = COALESCE(NULLIF(btrim(p.full_name), ''), p.email)
  FROM public.profiles p
 WHERE p.id = c.author_id AND c.author_name IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
