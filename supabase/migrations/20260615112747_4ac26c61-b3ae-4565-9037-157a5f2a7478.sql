ALTER TABLE public.work_permits
  ADD COLUMN IF NOT EXISTS building_zone text
  CHECK (building_zone IS NULL OR building_zone IN ('business_tower','shopping_center','carpark','outdoor'));