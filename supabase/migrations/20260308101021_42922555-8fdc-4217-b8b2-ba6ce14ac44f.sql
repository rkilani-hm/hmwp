
-- Allow admins to delete permit workflow audit records
CREATE POLICY "Admins can delete permit_workflow_audit"
ON public.permit_workflow_audit
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete permit workflow overrides
CREATE POLICY "Admins can delete permit_workflow_overrides"
ON public.permit_workflow_overrides
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete signature audit logs
CREATE POLICY "Admins can delete signature_audit_logs"
ON public.signature_audit_logs
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete notifications
CREATE POLICY "Admins can delete any notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
