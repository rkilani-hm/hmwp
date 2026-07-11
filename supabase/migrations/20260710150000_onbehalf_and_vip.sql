-- Phase 2: submit-on-behalf + VIP tenants
--
-- Some tenants (esp. VIPs) don't raise permits themselves — Al Hamra staff do it
-- for them. And tenants sometimes have their contractor fill the form. Both are
-- the same mechanism: an authorized staff member creates a WP/GP whose OWNER is
-- the selected tenant, with the creator recorded for audit + notifications.
--
-- Notification rule (business requirement): on an on-behalf submission, every
-- notification goes to BOTH the tenant (owner) AND the creator.

ALTER TABLE public.profiles     ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false;
ALTER TABLE public.work_permits ADD COLUMN IF NOT EXISTS created_on_behalf_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.gate_passes  ADD COLUMN IF NOT EXISTS created_on_behalf_by uuid REFERENCES public.profiles(id);

-- Who may submit on behalf of a tenant: admins + Client Relations / Customer
-- Service staff. Matched by pattern so the exact (special-character) role names
-- don't have to be hard-coded.
CREATE OR REPLACE FUNCTION public.can_submit_on_behalf(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user
      AND (r.name = 'admin'
           OR r.name ILIKE '%client_relations%'
           OR r.name ILIKE '%customer_service%')
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_submit_on_behalf(uuid) TO authenticated;

-- Tenants selectable in the on-behalf picker (authorized staff only). VIPs first.
CREATE OR REPLACE FUNCTION public.list_onbehalf_tenants()
RETURNS TABLE(id uuid, full_name text, email text, company_name text, is_vip boolean, unit text, floor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.full_name, p.email, p.company_name, p.is_vip, p.unit, p.floor
  FROM public.profiles p
  WHERE public.can_submit_on_behalf(auth.uid())
    AND EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                WHERE ur.user_id = p.id AND r.name = 'tenant')
  ORDER BY p.is_vip DESC, p.full_name;
$$;
GRANT EXECUTE ON FUNCTION public.list_onbehalf_tenants() TO authenticated;

-- Admin-only: flag/unflag a tenant as VIP.
CREATE OR REPLACE FUNCTION public.set_tenant_vip(p_tenant uuid, p_is_vip boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can change VIP status';
  END IF;
  UPDATE public.profiles SET is_vip = p_is_vip, updated_at = now() WHERE id = p_tenant;
END; $$;
GRANT EXECUTE ON FUNCTION public.set_tenant_vip(uuid, boolean) TO authenticated;
