-- Add parent_permit_id for version chain linking
ALTER TABLE public.work_permits
ADD COLUMN IF NOT EXISTS parent_permit_id uuid REFERENCES public.work_permits(id);

-- Add 'superseded' status to the enum
ALTER TYPE permit_status ADD VALUE IF NOT EXISTS 'superseded';

-- Create index for efficient version chain queries
CREATE INDEX IF NOT EXISTS idx_work_permits_parent_permit_id 
ON public.work_permits(parent_permit_id);

-- Add RLS policy for viewing permits in the same version chain
CREATE POLICY "Users can view permits in version chain"
ON public.work_permits
FOR SELECT
USING (
  -- User owns a permit in the chain (parent or child)
  EXISTS (
    SELECT 1 FROM public.work_permits wp
    WHERE wp.requester_id = auth.uid()
    AND (
      wp.id = work_permits.parent_permit_id
      OR wp.parent_permit_id = work_permits.id
      OR wp.id = work_permits.id
    )
  )
);