
ALTER TABLE public.gate_passes
  ADD COLUMN IF NOT EXISTS security_pmd_name text,
  ADD COLUMN IF NOT EXISTS security_pmd_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS security_pmd_signature text,
  ADD COLUMN IF NOT EXISTS security_pmd_comments text,
  ADD COLUMN IF NOT EXISTS security_pmd_material_action text;
