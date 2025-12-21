-- Create app role enum
CREATE TYPE public.app_role AS ENUM ('contractor', 'helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout', 'soft_facilities', 'hard_facilities', 'pm_service', 'admin');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  company_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Create work_types table
CREATE TABLE public.work_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  requires_pm BOOLEAN NOT NULL DEFAULT false,
  requires_pd BOOLEAN NOT NULL DEFAULT false,
  requires_bdcr BOOLEAN NOT NULL DEFAULT false,
  requires_mpr BOOLEAN NOT NULL DEFAULT false,
  requires_it BOOLEAN NOT NULL DEFAULT false,
  requires_fitout BOOLEAN NOT NULL DEFAULT false,
  requires_soft_facilities BOOLEAN NOT NULL DEFAULT false,
  requires_hard_facilities BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create permit_status enum
CREATE TYPE public.permit_status AS ENUM (
  'draft', 'submitted', 'under_review', 'pending_pm', 'pending_pd', 
  'pending_bdcr', 'pending_mpr', 'pending_it', 'pending_fitout',
  'pending_soft_facilities', 'pending_hard_facilities', 'pending_pm_service',
  'approved', 'rejected', 'closed'
);

-- Create work_permits table
CREATE TABLE public.work_permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_no TEXT NOT NULL UNIQUE,
  status permit_status NOT NULL DEFAULT 'draft',
  requester_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  contractor_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  floor TEXT NOT NULL,
  contact_mobile TEXT NOT NULL,
  work_description TEXT NOT NULL,
  work_location TEXT NOT NULL,
  work_date_from DATE NOT NULL,
  work_date_to DATE NOT NULL,
  work_time_from TIME NOT NULL,
  work_time_to TIME NOT NULL,
  attachments TEXT[] DEFAULT '{}',
  work_type_id UUID REFERENCES public.work_types(id),
  
  -- Helpdesk approval
  helpdesk_status TEXT DEFAULT 'pending',
  helpdesk_approver_name TEXT,
  helpdesk_approver_email TEXT,
  helpdesk_date TIMESTAMPTZ,
  helpdesk_comments TEXT,
  helpdesk_signature TEXT,
  
  -- PM approval
  pm_status TEXT DEFAULT 'pending',
  pm_approver_name TEXT,
  pm_approver_email TEXT,
  pm_date TIMESTAMPTZ,
  pm_comments TEXT,
  pm_signature TEXT,
  
  -- PD approval
  pd_status TEXT DEFAULT 'pending',
  pd_approver_name TEXT,
  pd_approver_email TEXT,
  pd_date TIMESTAMPTZ,
  pd_comments TEXT,
  pd_signature TEXT,
  
  -- BDCR approval
  bdcr_status TEXT DEFAULT 'pending',
  bdcr_approver_name TEXT,
  bdcr_approver_email TEXT,
  bdcr_date TIMESTAMPTZ,
  bdcr_comments TEXT,
  bdcr_signature TEXT,
  
  -- MPR approval
  mpr_status TEXT DEFAULT 'pending',
  mpr_approver_name TEXT,
  mpr_approver_email TEXT,
  mpr_date TIMESTAMPTZ,
  mpr_comments TEXT,
  mpr_signature TEXT,
  
  -- IT approval
  it_status TEXT DEFAULT 'pending',
  it_approver_name TEXT,
  it_approver_email TEXT,
  it_date TIMESTAMPTZ,
  it_comments TEXT,
  it_signature TEXT,
  
  -- Fitout approval
  fitout_status TEXT DEFAULT 'pending',
  fitout_approver_name TEXT,
  fitout_approver_email TEXT,
  fitout_date TIMESTAMPTZ,
  fitout_comments TEXT,
  fitout_signature TEXT,
  
  -- Soft Facilities approval
  soft_facilities_status TEXT DEFAULT 'pending',
  soft_facilities_approver_name TEXT,
  soft_facilities_approver_email TEXT,
  soft_facilities_date TIMESTAMPTZ,
  soft_facilities_comments TEXT,
  soft_facilities_signature TEXT,
  
  -- Hard Facilities approval
  hard_facilities_status TEXT DEFAULT 'pending',
  hard_facilities_approver_name TEXT,
  hard_facilities_approver_email TEXT,
  hard_facilities_date TIMESTAMPTZ,
  hard_facilities_comments TEXT,
  hard_facilities_signature TEXT,
  
  -- PM Service Provider approval
  pm_service_status TEXT DEFAULT 'pending',
  pm_service_approver_name TEXT,
  pm_service_approver_email TEXT,
  pm_service_date TIMESTAMPTZ,
  pm_service_comments TEXT,
  pm_service_signature TEXT,
  
  -- Closing info
  closing_remarks TEXT,
  closing_clean_confirmed BOOLEAN DEFAULT false,
  closing_incidents TEXT,
  closed_by TEXT,
  closed_date TIMESTAMPTZ,
  
  -- PDF
  pdf_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create activity_logs table
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id UUID REFERENCES public.work_permits(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  performed_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Create has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if user has any approver role
CREATE OR REPLACE FUNCTION public.is_approver(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout', 'soft_facilities', 'hard_facilities', 'pm_service', 'admin')
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Work types policies (readable by all authenticated, manageable by admin)
CREATE POLICY "Authenticated users can view work types"
  ON public.work_types FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage work types"
  ON public.work_types FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Work permits policies
CREATE POLICY "Users can view own permits"
  ON public.work_permits FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "Approvers can view all permits"
  ON public.work_permits FOR SELECT
  TO authenticated
  USING (public.is_approver(auth.uid()));

CREATE POLICY "Users can create permits"
  ON public.work_permits FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update own draft permits"
  ON public.work_permits FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid() AND status = 'draft');

CREATE POLICY "Approvers can update permits"
  ON public.work_permits FOR UPDATE
  TO authenticated
  USING (public.is_approver(auth.uid()));

-- Activity logs policies
CREATE POLICY "Users can view logs for own permits"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_permits
      WHERE id = permit_id AND requester_id = auth.uid()
    )
  );

CREATE POLICY "Approvers can view all logs"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (public.is_approver(auth.uid()));

CREATE POLICY "Authenticated users can create logs"
  ON public.activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (performed_by_id = auth.uid());

-- Create trigger for profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  
  -- Default role is contractor
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'contractor');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_work_permits_updated_at
  BEFORE UPDATE ON public.work_permits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for work_permits
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_permits;

-- Insert default work types
INSERT INTO public.work_types (name, requires_pm, requires_pd, requires_bdcr, requires_mpr, requires_it, requires_fitout, requires_soft_facilities, requires_hard_facilities)
VALUES 
  ('General Maintenance', true, false, false, false, false, false, true, true),
  ('Electrical Work', true, false, true, false, false, false, false, true),
  ('HVAC Maintenance', true, false, false, true, false, false, false, true),
  ('IT Infrastructure', true, false, false, false, true, false, false, false),
  ('Fit-Out Work', true, true, true, true, false, true, true, true),
  ('Plumbing', true, false, false, false, false, false, false, true),
  ('Fire Safety', true, false, true, false, false, false, true, true),
  ('Event Setup', true, false, false, false, false, false, true, false);