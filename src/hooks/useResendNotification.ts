import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ResendNotificationResult {
  success: boolean;
  message: string;
  details: {
    inAppNotifications: number;
    pushNotifications: number;
    emailNotifications: number;
    targetRole: string;
  };
}

export function useResendNotification() {
  return useMutation({
    mutationFn: async (permitId: string): Promise<ResendNotificationResult> => {
      const { data, error } = await supabase.functions.invoke('resend-approval-notification', {
        body: { permitId },
      });

      if (error) {
        throw new Error(error.message || 'Failed to resend notifications');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data as ResendNotificationResult;
    },
    onSuccess: (data) => {
      toast.success(data.message, {
        description: `In-app: ${data.details.inAppNotifications}, Email: ${data.details.emailNotifications}`,
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to resend notifications', {
        description: error.message,
      });
    },
  });
}
