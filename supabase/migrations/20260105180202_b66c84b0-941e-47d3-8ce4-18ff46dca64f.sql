
-- Create permissions table
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz DEFAULT now()
);

-- Create role_permissions junction table
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE NOT NULL,
  permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (role_id, permission_id)
);

-- Enable RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Permissions policies
CREATE POLICY "Anyone can view permissions" ON public.permissions
FOR SELECT USING (true);

CREATE POLICY "Admins can manage permissions" ON public.permissions
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Role permissions policies
CREATE POLICY "Admins can manage role_permissions" ON public.role_permissions
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view role_permissions" ON public.role_permissions
FOR SELECT USING (true);

-- Insert default permissions
INSERT INTO public.permissions (name, label, description, category) VALUES
('view_dashboard', 'View Dashboard', 'Access the main dashboard', 'navigation'),
('create_permits', 'Create Permits', 'Create new work permits', 'permits'),
('view_own_permits', 'View Own Permits', 'View permits created by self', 'permits'),
('view_all_permits', 'View All Permits', 'View all work permits', 'permits'),
('approve_permits', 'Approve Permits', 'Approve or reject work permits', 'permits'),
('manage_users', 'Manage Users', 'Create and manage user accounts', 'admin'),
('manage_roles', 'Manage Roles', 'Create and manage roles', 'admin'),
('manage_work_types', 'Manage Work Types', 'Configure work types', 'admin'),
('view_reports', 'View Reports', 'Access reports and analytics', 'admin'),
('view_sla_dashboard', 'View SLA Dashboard', 'Access SLA monitoring', 'admin'),
('view_activity_logs', 'View Activity Logs', 'View user activity logs', 'admin');

-- Assign default permissions to admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p WHERE r.name = 'admin';

-- Assign basic permissions to contractor role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'contractor' AND p.name IN ('view_dashboard', 'create_permits', 'view_own_permits');
