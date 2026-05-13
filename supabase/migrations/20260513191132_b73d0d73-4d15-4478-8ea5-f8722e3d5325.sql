BEGIN;

INSERT INTO public.roles (name, label, description, is_system, is_active)
VALUES ('tenant', 'Tenant',
        'Default role for tenants who submit work permits and gate pass requests',
        true, true)
ON CONFLICT (name) DO UPDATE
  SET is_active = true,
      is_system = true;

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
  IF signup_source = 'admin_created' OR NEW.raw_user_meta_data->>'admin_created' = 'true' THEN
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

  IF signup_source <> 'admin_created' AND COALESCE(NEW.raw_user_meta_data->>'admin_created', '') <> 'true' THEN
    SELECT id INTO tenant_role_id FROM public.roles WHERE name = 'tenant' LIMIT 1;

    IF tenant_role_id IS NULL THEN
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

DROP POLICY IF EXISTS "Users can withdraw own non-terminal permits" ON public.work_permits;
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