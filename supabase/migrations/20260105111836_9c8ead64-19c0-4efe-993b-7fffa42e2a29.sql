-- Create roles table to store dynamic roles
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_system boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Everyone can view active roles
CREATE POLICY "Anyone can view active roles"
ON public.roles
FOR SELECT
USING (is_active = true);

-- Only admins can manage roles
CREATE POLICY "Admins can manage roles"
ON public.roles
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_roles_updated_at
BEFORE UPDATE ON public.roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert existing roles from the enum as system roles
INSERT INTO public.roles (name, label, description, is_system) VALUES
  ('contractor', 'Contractor', 'Default role for permit requesters', true),
  ('helpdesk', 'Helpdesk', 'Initial permit review and processing', true),
  ('pm', 'Property Management', 'Property management approval', true),
  ('pd', 'Project Development', 'Project development approval', true),
  ('bdcr', 'BDCR', 'BDCR department approval', true),
  ('mpr', 'MPR', 'MPR department approval', true),
  ('it', 'IT Department', 'IT department approval', true),
  ('fitout', 'Fit-Out', 'Fit-out department approval', true),
  ('soft_facilities', 'Soft Facilities', 'Soft facilities approval', true),
  ('hard_facilities', 'Hard Facilities', 'Hard facilities approval', true),
  ('pm_service', 'PM Service Provider', 'PM service provider approval', true),
  ('admin', 'Administrator', 'Full system access and management', true);