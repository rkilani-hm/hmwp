-- Drop the overly permissive INSERT policy
DROP POLICY IF EXISTS "Service can insert activity logs" ON public.user_activity_logs;

-- Create a new policy that restricts users to only log their own activities
CREATE POLICY "Users can only log their own activities"
ON public.user_activity_logs
FOR INSERT
WITH CHECK (user_id = auth.uid());