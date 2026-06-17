CREATE TABLE public.wp_approval_cc_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, DELETE ON public.wp_approval_cc_recipients TO authenticated;
GRANT ALL ON public.wp_approval_cc_recipients TO service_role;

ALTER TABLE public.wp_approval_cc_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view CC recipients"
  ON public.wp_approval_cc_recipients
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'admin'
  ));

CREATE POLICY "Admins can add CC recipients"
  ON public.wp_approval_cc_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'admin'
  ));

CREATE POLICY "Admins can remove CC recipients"
  ON public.wp_approval_cc_recipients
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'admin'
  ));