BEGIN;

CREATE TYPE document_category AS ENUM (
  'civil_id',
  'driving_license',
  'other'
);

CREATE TYPE extraction_status AS ENUM (
  'pending',
  'processing',
  'success',
  'failed',
  'skipped'
);

CREATE TABLE public.permit_attachments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id             uuid NOT NULL REFERENCES public.work_permits(id) ON DELETE CASCADE,

  file_path             text NOT NULL,
  file_name             text NOT NULL,
  file_size             bigint,
  mime_type             text,

  document_type         document_category NOT NULL DEFAULT 'other',

  extracted_name        text,
  extracted_id_number   text,
  extracted_expiry_date date,
  extracted_issue_date  date,
  extracted_nationality text,
  is_valid              boolean,

  extraction_status     extraction_status NOT NULL DEFAULT 'pending',
  extraction_error      text,
  extracted_at          timestamptz,

  uploaded_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_permit_attachments_permit_id ON public.permit_attachments(permit_id);
CREATE INDEX idx_permit_attachments_document_type ON public.permit_attachments(document_type);
CREATE INDEX idx_permit_attachments_extraction_status ON public.permit_attachments(extraction_status);

CREATE OR REPLACE FUNCTION public.update_attachment_validity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.extracted_expiry_date IS NOT NULL THEN
    NEW.is_valid := NEW.extracted_expiry_date >= CURRENT_DATE;
  ELSE
    NEW.is_valid := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_attachment_validity
  BEFORE INSERT OR UPDATE ON public.permit_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_attachment_validity();

ALTER TABLE public.permit_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requesters can view own permit attachments"
  ON public.permit_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_permits wp
       WHERE wp.id = permit_attachments.permit_id
         AND wp.requester_id = auth.uid()
    )
  );

CREATE POLICY "Approvers can view assigned permit attachments"
  ON public.permit_attachments FOR SELECT
  USING (
    public.is_approver(auth.uid())
  );

CREATE POLICY "Admins can view all permit attachments"
  ON public.permit_attachments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.user_id = auth.uid()
         AND r.name = 'admin'
    )
  );

CREATE POLICY "Users can insert own permit attachments"
  ON public.permit_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_permits wp
       WHERE wp.id = permit_attachments.permit_id
         AND wp.requester_id = auth.uid()
    )
  );

CREATE POLICY "Service role can update extraction results"
  ON public.permit_attachments FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
