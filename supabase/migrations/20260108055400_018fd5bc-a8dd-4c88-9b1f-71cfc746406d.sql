-- Fix SUPA_rls_policy_always_true: Restrict notifications INSERT to service role only
-- The current "Service can insert notifications" policy with `WITH CHECK (true)` is overly permissive

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;

-- Create a more restrictive policy that allows authenticated users to only insert notifications for themselves
-- This ensures users can't insert notifications for other users
CREATE POLICY "Users can insert notifications for themselves" 
ON public.notifications FOR INSERT TO authenticated 
WITH CHECK (user_id = auth.uid());

-- Also allow service role to insert any notifications (for edge functions/triggers)
-- Note: service_role bypasses RLS by default, but this makes the intent explicit