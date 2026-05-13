-- Make is_approver() data-driven instead of a hardcoded role list
--
-- ## The bug
--
-- public.is_approver(user_id) returns TRUE if the user holds ANY of a
-- fixed hardcoded set of role names:
--
--   customer_service, cr_coordinator, head_cr, fmsp_approval,
--   helpdesk, pm, pd, bdcr, mpr, it, fitout,
--   soft_facilities, hard_facilities, pm_service, admin,
--   ecovert_supervisor, pmd_coordinator,
--   store_manager, finance, security
--
-- ANY custom role admins create through RolesManagement
-- (e.g. al_hamra_customer_service) is NOT in this list, so the function
-- returns FALSE for users who hold ONLY a custom role.
--
-- 18 RLS policies use is_approver(), most importantly:
--
--   "Approvers can view all permits"        on work_permits SELECT
--   "Approvers can update permits"          on work_permits UPDATE
--   "Approvers can view all permit approvals" on permit_approvals SELECT
--   "Approvers can view all logs"           on activity_logs SELECT
--
-- So a user holding only a custom approver role:
--
--   1. Cannot see ANY permits (only their own as requester)
--   2. Cannot update permits (can't approve / reject)
--   3. Cannot see permit_approvals rows
--   4. The permit_active_approvers view (which JOINs to work_permits)
--      returns ZERO rows for them — empty inbox
--   5. Cannot see activity logs
--
-- This was reported as "alhamracs (al_hamra_customer_service) doesn't
-- see permits that tenants submit, only ones admin submits". The admin-
-- created exception is incidental: admin holds the 'admin' role which
-- IS in the hardcoded list, so admin's own RLS isn't broken; what shows
-- in alhamracs's inbox is probably an alhamracs-as-requester case or
-- alhamracs holds a second legacy role too.
--
-- ## The fix
--
-- Replace is_approver() with a data-driven version: a user is an
-- approver iff they hold either:
--
--   (a) the 'admin' role, OR
--   (b) ANY role that appears in workflow_steps
--
-- (b) is the operational definition — "this role acts in at least one
-- workflow" = approver. Custom roles auto-qualify the moment admin
-- adds them to a workflow_steps row via Workflow Builder. Tenants
-- don't appear in workflow_steps so the tenant role remains
-- non-approver. Approvers in legacy roles still pass — every legacy
-- role from the old hardcoded list also has workflow_steps entries.
--
-- ## Why not check effective_approvers view
--
-- effective_approvers (from approval-delegation) unions user_roles
-- with active delegations. Using it would also count pure delegates
-- as approvers, which is correct longer-term but was deferred as a
-- bigger change. For now, the data-driven version using user_roles
-- directly is a strict improvement over the hardcoded list and
-- leaves the delegation concern as a separate question.
--
-- ## Risk
--
-- This is more PERMISSIVE for custom-role holders: they now pass
-- is_approver() where they previously failed. It's not more permissive
-- for anyone else — every role in the old hardcoded list also has
-- workflow_steps entries (or it would've been useless), so existing
-- behavior is preserved.
--
-- STABLE function so query planner can cache results within a
-- statement; SECURITY DEFINER so RLS doesn't recursively gate the
-- function's own user_roles read.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_approver(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Branch 1: admin always counts
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = _user_id
       AND r.name = 'admin'
  )
  OR EXISTS (
    -- Branch 2: holds any role that's actively used in some workflow.
    -- This is the empirical definition of an approver role — admins
    -- assign roles to workflow steps via the Workflow Builder. If a
    -- role appears in any workflow_steps row, holders of that role
    -- can be expected to act on permits routed through that workflow.
    SELECT 1
      FROM public.user_roles ur
      JOIN public.workflow_steps ws ON ws.role_id = ur.role_id
     WHERE ur.user_id = _user_id
  );
$$;

COMMENT ON FUNCTION public.is_approver(uuid) IS
  'TRUE if the user holds the admin role OR any role that appears in '
  'at least one workflow_steps row. Data-driven — custom roles auto-'
  'qualify as soon as admin adds them to a workflow.';

-- Reload PostgREST schema cache so the change takes effect immediately
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ---------------------------------------------------------------
-- Sanity-check diagnostic — run manually if you want to see which
-- users this change affects:
--
--   WITH old_behavior AS (
--     SELECT DISTINCT ur.user_id
--       FROM public.user_roles ur
--       JOIN public.roles r ON r.id = ur.role_id
--      WHERE r.name IN (
--        'customer_service','cr_coordinator','head_cr','fmsp_approval',
--        'helpdesk','pm','pd','bdcr','mpr','it','fitout',
--        'soft_facilities','hard_facilities','pm_service','admin',
--        'ecovert_supervisor','pmd_coordinator',
--        'store_manager','finance','security'
--      )
--   ),
--   new_behavior AS (
--     SELECT id AS user_id
--       FROM auth.users u
--      WHERE public.is_approver(u.id)
--   )
--   SELECT p.email, p.full_name, 'newly recognized as approver' AS change
--     FROM new_behavior nb
--     JOIN public.profiles p ON p.id = nb.user_id
--    WHERE nb.user_id NOT IN (SELECT user_id FROM old_behavior)
--    ORDER BY p.email;
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- Verify: run this to confirm the change works for the reported user
--
--   SELECT p.email, public.is_approver(p.id) AS is_approver_now
--     FROM public.profiles p
--    WHERE p.email = 'alhamracs@alhamra.com.kw';
-- ---------------------------------------------------------------
