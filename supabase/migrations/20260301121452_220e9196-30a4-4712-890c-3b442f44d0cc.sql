
-- Gate Passes table
CREATE TABLE public.gate_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_no text NOT NULL,
  pass_category text NOT NULL CHECK (pass_category IN ('detailed_material_pass', 'generic_delivery_permit')),
  pass_type text NOT NULL CHECK (pass_type IN ('material_out', 'material_in', 'asset_transfer', 'scrap_disposal', 'contractor_tools', 'internal_shifting')),
  status text NOT NULL DEFAULT 'pending_store_manager' CHECK (status IN ('draft', 'pending_store_manager', 'pending_finance', 'pending_security', 'approved', 'rejected', 'completed')),
  
  -- Requester
  requester_id uuid NOT NULL,
  requester_name text NOT NULL,
  requester_email text NOT NULL,
  date_of_request date NOT NULL DEFAULT CURRENT_DATE,
  
  -- Entity
  client_contractor_name text,
  client_rep_name text,
  client_rep_email text,
  client_rep_contact text,
  
  -- Location
  unit_floor text,
  delivery_area text,
  
  -- Schedule
  valid_from date,
  valid_to date,
  time_from time,
  time_to time,
  
  -- Vehicle
  vehicle_make_model text,
  vehicle_license_plate text,
  
  -- Logistics
  shifting_method text CHECK (shifting_method IS NULL OR shifting_method IN ('manually', 'material_trolley', 'pallet_trolley', 'forklift')),
  
  -- Purpose
  purpose text,
  has_high_value_asset boolean NOT NULL DEFAULT false,
  
  -- Store Manager approval
  store_manager_name text,
  store_manager_date timestamptz,
  store_manager_comments text,
  store_manager_signature text,
  
  -- Finance approval
  finance_name text,
  finance_date timestamptz,
  finance_comments text,
  finance_signature text,
  
  -- Security approval
  security_name text,
  security_date timestamptz,
  security_comments text,
  security_signature text,
  security_cctv_confirmed boolean DEFAULT false,
  
  -- Completion
  completed_at timestamptz,
  completed_by text,
  
  -- Generic delivery fields
  delivery_type text CHECK (delivery_type IS NULL OR delivery_type IN ('goods', 'food', 'materials')),
  
  -- PDF
  pdf_url text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Gate Pass Items table
CREATE TABLE public.gate_pass_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_pass_id uuid NOT NULL REFERENCES public.gate_passes(id) ON DELETE CASCADE,
  serial_number integer NOT NULL,
  item_details text NOT NULL,
  quantity text NOT NULL DEFAULT '1',
  remarks text,
  is_high_value boolean NOT NULL DEFAULT false
);

-- Updated_at trigger
CREATE TRIGGER update_gate_passes_updated_at
  BEFORE UPDATE ON public.gate_passes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.gate_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_pass_items ENABLE ROW LEVEL SECURITY;

-- Helper function to check gate pass approver roles
CREATE OR REPLACE FUNCTION public.is_gate_pass_approver(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND r.name IN ('store_manager', 'finance', 'security', 'admin')
  )
$$;

-- RLS for gate_passes
CREATE POLICY "Users can view own gate passes"
  ON public.gate_passes FOR SELECT
  USING (requester_id = auth.uid());

CREATE POLICY "Gate pass approvers can view all"
  ON public.gate_passes FOR SELECT
  USING (is_gate_pass_approver(auth.uid()));

CREATE POLICY "Users can create gate passes"
  ON public.gate_passes FOR INSERT
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Gate pass approvers can update"
  ON public.gate_passes FOR UPDATE
  USING (is_gate_pass_approver(auth.uid()));

CREATE POLICY "Users can update own draft gate passes"
  ON public.gate_passes FOR UPDATE
  USING (requester_id = auth.uid() AND status = 'draft');

-- RLS for gate_pass_items
CREATE POLICY "Users can view items of own gate passes"
  ON public.gate_pass_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.gate_passes gp
    WHERE gp.id = gate_pass_items.gate_pass_id
      AND gp.requester_id = auth.uid()
  ));

CREATE POLICY "Gate pass approvers can view all items"
  ON public.gate_pass_items FOR SELECT
  USING (is_gate_pass_approver(auth.uid()));

CREATE POLICY "Users can insert items for own gate passes"
  ON public.gate_pass_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.gate_passes gp
    WHERE gp.id = gate_pass_items.gate_pass_id
      AND gp.requester_id = auth.uid()
  ));

CREATE POLICY "Gate pass approvers can manage items"
  ON public.gate_pass_items FOR ALL
  USING (is_gate_pass_approver(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.gate_passes;
