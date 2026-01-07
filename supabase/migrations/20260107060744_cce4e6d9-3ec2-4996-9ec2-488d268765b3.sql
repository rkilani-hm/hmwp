-- Create table for storing push notification subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Enable Row Level Security
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own subscriptions" 
ON public.push_subscriptions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions" 
ON public.push_subscriptions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions" 
ON public.push_subscriptions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);