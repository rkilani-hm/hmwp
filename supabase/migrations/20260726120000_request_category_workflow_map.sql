-- Automate approval-workflow selection from the request purpose.
--
-- The engine resolves a permit's workflow purely from
--   work_permits.work_type_id -> work_types.workflow_template_id
-- (see ensure_permit_pending_approvals). So to pick the workflow automatically
-- from the purpose, we map each purpose (request_category) to the work type that
-- carries its workflow, and the wizard sets work_type_id from that map instead of
-- asking the user.
--
-- Purpose -> workflow, as agreed:
--   gate_pass         -> Gate Pass (In/Out Material)
--   maintenance       -> Client Maintenance
--   unit_modification -> Client Unit Modifications
--   tenant_fitout     -> New Client Fit Out works   (the new "New Tenant Fitout")
--   photoshoot        -> MKT Workflow                (client marketing workflow)

-- 1. Some workflow templates had NO work type pointing at them, so they were
--    unreachable. Create the client-facing work types so gate passes and photo
--    shoots route to their own workflows instead of a work-permit one.
INSERT INTO public.work_types (name, workflow_template_id)
SELECT 'Material Gate Pass', t.id
FROM public.workflow_templates t
WHERE t.name = 'Gate Pass (In/Out Material)'
  AND NOT EXISTS (SELECT 1 FROM public.work_types wt WHERE wt.name = 'Material Gate Pass');

INSERT INTO public.work_types (name, workflow_template_id)
SELECT 'Photo Shoot', t.id
FROM public.workflow_templates t
WHERE t.name = 'MKT Workflow' AND t.workflow_type = 'client'
  AND NOT EXISTS (SELECT 1 FROM public.work_types wt WHERE wt.name = 'Photo Shoot');

-- 2. Purpose -> work type map (admin-editable config).
CREATE TABLE IF NOT EXISTS public.request_category_work_types (
  request_category text PRIMARY KEY,
  work_type_id     uuid NOT NULL REFERENCES public.work_types(id) ON DELETE CASCADE,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.request_category_work_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read category map" ON public.request_category_work_types;
CREATE POLICY "Anyone authenticated can read category map"
  ON public.request_category_work_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage category map" ON public.request_category_work_types;
CREATE POLICY "Admins manage category map"
  ON public.request_category_work_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Seed the five automatic purposes.
INSERT INTO public.request_category_work_types (request_category, work_type_id)
SELECT c.cat, wt.id
FROM (VALUES
  ('gate_pass',        'Material Gate Pass'),
  ('maintenance',      'Client Maintenance'),
  ('unit_modification','Client Unit Modifications'),
  ('tenant_fitout',    'New Client Fit Out works'),
  ('photoshoot',       'Photo Shoot')
) AS c(cat, wt_name)
JOIN public.work_types wt ON wt.name = c.wt_name
ON CONFLICT (request_category)
  DO UPDATE SET work_type_id = EXCLUDED.work_type_id, updated_at = now();

-- 4. Read RPC for the wizard.
CREATE OR REPLACE FUNCTION public.get_request_category_work_types()
RETURNS TABLE (request_category text, work_type_id uuid, work_type_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.request_category, m.work_type_id, wt.name
  FROM public.request_category_work_types m
  JOIN public.work_types wt ON wt.id = m.work_type_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_request_category_work_types() TO authenticated;
