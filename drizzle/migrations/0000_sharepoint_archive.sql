-- =============================================================================
-- SharePoint archive of approved work-permit PDFs
--
-- After a permit is FULLY approved and its PDF is generated, the system uploads
-- a copy to a configurable SharePoint document library via Microsoft Graph
-- (same M365 app credentials the email pipeline uses).
--
-- This migration adds the admin-configurable destination + an upload log. The
-- upload itself is done by the archive-permit-to-sharepoint edge function.
-- =============================================================================

-- Singleton destination config.
CREATE TABLE IF NOT EXISTS public.sharepoint_settings (
  id                boolean     PRIMARY KEY DEFAULT true,
  enabled           boolean     NOT NULL DEFAULT false,
  site_hostname     text,                    -- e.g. alhamra.sharepoint.com
  site_path         text,                    -- e.g. /sites/FMU  (blank = root site)
  library_name      text,                    -- document library display name (blank = default)
  folder_path       text        DEFAULT 'Work Permits/{yyyy}/{MM}',
  filename_template text        DEFAULT '{permit_no}.pdf',
  timezone          text        DEFAULT 'Asia/Kuwait',
  last_test_at      timestamptz,
  last_test_ok      boolean,
  last_test_message text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  CONSTRAINT sharepoint_settings_singleton CHECK (id = true)
);
INSERT INTO public.sharepoint_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Per-permit upload log (one row per attempt).
CREATE TABLE IF NOT EXISTS public.sharepoint_uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id     uuid REFERENCES public.work_permits(id) ON DELETE CASCADE,
  permit_no     text,
  status        text NOT NULL,               -- 'uploaded' | 'failed' | 'skipped'
  web_url       text,
  folder_path   text,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sp_uploads_permit ON public.sharepoint_uploads(permit_id);
CREATE INDEX IF NOT EXISTS idx_sp_uploads_created ON public.sharepoint_uploads(created_at DESC);

ALTER TABLE public.sharepoint_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sharepoint_uploads  ENABLE ROW LEVEL SECURITY;

-- Settings: any signed-in user may read (the config screen needs it); admins write.
DROP POLICY IF EXISTS sp_settings_read  ON public.sharepoint_settings;
DROP POLICY IF EXISTS sp_settings_write ON public.sharepoint_settings;
CREATE POLICY sp_settings_read  ON public.sharepoint_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY sp_settings_write ON public.sharepoint_settings FOR ALL    TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Uploads log: internal staff / admins may read; writes happen via the edge
-- function (service role, RLS-exempt).
DROP POLICY IF EXISTS sp_uploads_read ON public.sharepoint_uploads;
CREATE POLICY sp_uploads_read ON public.sharepoint_uploads FOR SELECT TO authenticated
  USING (public.is_non_tenant_staff(auth.uid()) OR public.has_role(auth.uid(),'admin'));