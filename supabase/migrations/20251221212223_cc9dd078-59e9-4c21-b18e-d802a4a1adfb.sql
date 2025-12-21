-- Add urgency and SLA fields to work_permits
ALTER TABLE public.work_permits ADD COLUMN IF NOT EXISTS urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent'));
ALTER TABLE public.work_permits ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ;
ALTER TABLE public.work_permits ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT false;

-- Add is_active field to profiles for enable/disable users
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create signature audit logs table for secure signature tracking
CREATE TABLE IF NOT EXISTS public.signature_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id UUID REFERENCES public.work_permits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  ip_address TEXT,
  user_agent TEXT,
  device_info JSONB DEFAULT '{}',
  signature_hash TEXT,
  password_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on signature_audit_logs
ALTER TABLE public.signature_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for signature_audit_logs
CREATE POLICY "Admins can view all signature logs" 
ON public.signature_audit_logs 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approvers can view signature logs for their permits" 
ON public.signature_audit_logs 
FOR SELECT 
USING (is_approver(auth.uid()));

CREATE POLICY "Users can view signature logs for own permits" 
ON public.signature_audit_logs 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM work_permits 
  WHERE work_permits.id = signature_audit_logs.permit_id 
  AND work_permits.requester_id = auth.uid()
));

CREATE POLICY "Authenticated users can create signature logs" 
ON public.signature_audit_logs 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  permit_id UUID REFERENCES public.work_permits(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_permit', 'approval_needed', 'status_change', 'sla_warning', 'sla_breach', 'permit_approved', 'permit_rejected')),
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for notifications
CREATE POLICY "Users can view own notifications" 
ON public.notifications 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" 
ON public.notifications 
FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications" 
ON public.notifications 
FOR DELETE 
USING (user_id = auth.uid());

-- Service role can insert notifications (for edge functions)
CREATE POLICY "Service can insert notifications" 
ON public.notifications 
FOR INSERT 
WITH CHECK (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create index for faster notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_signature_audit_logs_permit_id ON public.signature_audit_logs(permit_id);
CREATE INDEX IF NOT EXISTS idx_work_permits_sla_deadline ON public.work_permits(sla_deadline) WHERE sla_breached = false;