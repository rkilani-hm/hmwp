-- Request purpose + purpose-specific details on work permits.
--
-- The New Request wizard routes every request (contractor work / material gate
-- pass / photo shoot) through the work-permit record. This stores WHICH purpose
-- it was, plus that purpose's own fields (e.g. the full Photo Shoot Form data),
-- so the correct form layout can be rendered on the PDF instead of dumping the
-- details into work_description.
--
-- Both columns are nullable with no default — existing work permits are
-- completely unaffected and continue to behave as plain work permits.

ALTER TABLE public.work_permits ADD COLUMN IF NOT EXISTS request_category text;
ALTER TABLE public.work_permits ADD COLUMN IF NOT EXISTS category_details jsonb;

COMMENT ON COLUMN public.work_permits.request_category IS
  'work_permit | gate_pass | photoshoot — the purpose chosen in the New Request wizard. NULL = legacy work permit.';
COMMENT ON COLUMN public.work_permits.category_details IS
  'Purpose-specific field data (e.g. the Photo Shoot Form fields) used to render the matching PDF layout.';
