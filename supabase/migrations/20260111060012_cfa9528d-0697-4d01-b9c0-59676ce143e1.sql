-- Create work_locations table for admin-controlled location options
CREATE TABLE public.work_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  location_type TEXT NOT NULL DEFAULT 'shop' CHECK (location_type IN ('shop', 'common')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.work_locations ENABLE ROW LEVEL SECURITY;

-- Admins can manage work locations
CREATE POLICY "Admins can manage work_locations"
ON public.work_locations FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can view active locations
CREATE POLICY "Users can view active work_locations"
ON public.work_locations FOR SELECT
USING (is_active = true);

-- Add location tracking columns to work_permits
ALTER TABLE public.work_permits 
  ADD COLUMN work_location_id UUID REFERENCES public.work_locations(id),
  ADD COLUMN work_location_other TEXT;

-- Create trigger for updated_at on work_locations
CREATE TRIGGER update_work_locations_updated_at
  BEFORE UPDATE ON public.work_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed data for common work locations
INSERT INTO public.work_locations (name, description, location_type) VALUES
  ('Shop', 'Retail shop unit', 'shop'),
  ('Office', 'Office space', 'shop'),
  ('Unit', 'General unit space', 'shop'),
  ('Store', 'Store unit', 'shop'),
  ('Kiosk', 'Kiosk location', 'shop'),
  ('Restaurant', 'Restaurant or F&B outlet', 'shop'),
  ('Corridor', 'Building corridor', 'common'),
  ('Lobby', 'Building lobby area', 'common'),
  ('Parking', 'Parking area', 'common'),
  ('Restroom', 'Restroom facilities', 'common'),
  ('Stairway', 'Staircase area', 'common'),
  ('Elevator Area', 'Elevator and lift area', 'common'),
  ('Common Area', 'General common area', 'common'),
  ('Roof', 'Rooftop area', 'common'),
  ('Basement', 'Basement level', 'common');