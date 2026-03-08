
-- Allow admins to delete work permits
CREATE POLICY "Admins can delete work permits"
ON public.work_permits
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete gate passes
CREATE POLICY "Admins can delete gate passes"
ON public.gate_passes
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete gate pass items (cascade)
CREATE POLICY "Admins can delete gate pass items"
ON public.gate_pass_items
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete activity logs for permits
CREATE POLICY "Admins can delete activity logs"
ON public.activity_logs
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
