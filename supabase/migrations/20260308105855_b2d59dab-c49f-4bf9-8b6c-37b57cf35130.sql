ALTER TABLE public.gate_passes
  ADD COLUMN IF NOT EXISTS cr_coordinator_name text,
  ADD COLUMN IF NOT EXISTS cr_coordinator_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cr_coordinator_comments text,
  ADD COLUMN IF NOT EXISTS cr_coordinator_signature text,
  ADD COLUMN IF NOT EXISTS head_cr_name text,
  ADD COLUMN IF NOT EXISTS head_cr_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS head_cr_comments text,
  ADD COLUMN IF NOT EXISTS head_cr_signature text,
  ADD COLUMN IF NOT EXISTS hm_security_pmd_name text,
  ADD COLUMN IF NOT EXISTS hm_security_pmd_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS hm_security_pmd_comments text,
  ADD COLUMN IF NOT EXISTS hm_security_pmd_signature text,
  ADD COLUMN IF NOT EXISTS hm_security_pmd_material_action text;