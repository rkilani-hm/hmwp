-- Filter in-app notifications for tenants.
--
-- Tenants are limited to three notification events:
--   1. permit_submitted     — submission confirmation
--   2. permit_approved      — FINAL approval only (intermediate uses
--                             'permit_step_approved' which is suppressed)
--   3. permit_rejected      — any rejection
--
-- Notifications of any other type targeting a user that has the
-- 'tenant' role are silently dropped at INSERT time. Non-tenant users
-- (approvers, admins, internal staff) are unaffected.
CREATE OR REPLACE FUNCTION public.filter_tenant_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_tenant boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = NEW.user_id
      AND r.name = 'tenant'
  ) INTO v_is_tenant;

  IF v_is_tenant AND NEW.type NOT IN (
    'permit_submitted',
    'permit_approved',
    'permit_rejected'
  ) THEN
    -- Silently skip the insert
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_filter_tenant_notifications ON public.notifications;
CREATE TRIGGER trg_filter_tenant_notifications
BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.filter_tenant_notifications();
