import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Manually trigger the daily approver reminder (the same digest the scheduled
 * job sends). Invokes the daily-approver-reminder edge function with the
 * caller's JWT, so the function's admin-auth path authorises it. Returns the
 * send summary { approvers, sent, failed }.
 */
export function useSendApproverReminders() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('daily-approver-reminder', {
        body: { manual: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { approvers: number; sent: number; failed: number };
    },
    onSuccess: (d) => {
      if (!d || d.approvers === 0) {
        toast.info('No approvers currently have pending permits — nothing to send.');
      } else {
        toast.success(`Reminders sent to ${d.sent} approver${d.sent === 1 ? '' : 's'}` +
          (d.failed ? ` (${d.failed} failed — check email logs)` : '') + '.');
      }
    },
    onError: (e: any) => toast.error('Could not send reminders: ' + (e?.message || 'unknown error')),
  });
}
