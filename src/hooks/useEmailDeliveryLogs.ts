import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EmailDeliveryLog {
  id: string;
  created_at: string;
  notification_type: string | null;
  recipients: string[];
  recipient_count: number;
  subject: string | null;
  permit_id: string | null;
  permit_no: string | null;
  status: 'sent' | 'failed';
  error_message: string | null;
  provider: string;
  duration_ms: number | null;
  has_attachment: boolean;
}

export interface EmailDeliveryLogFilters {
  status?: string;         // 'all' | 'sent' | 'failed'
  notificationType?: string; // 'all' | <type>
  recipient?: string;      // substring match on a recipient address
  permitNo?: string;       // substring match on permit number
  dateFrom?: string;
  dateTo?: string;
}

// email_delivery_logs isn't in the generated Supabase types yet (the table is
// added by the 20260702120000 migration). Cast the client for this query only,
// mirroring the existing `as any` pattern used for the get_emails_for_role RPC.
const db = supabase as unknown as {
  from: (t: string) => any;
};

export function useEmailDeliveryLogs(filters?: EmailDeliveryLogFilters) {
  return useQuery({
    queryKey: ['email-delivery-logs', filters],
    queryFn: async (): Promise<EmailDeliveryLog[]> => {
      let query = db
        .from('email_delivery_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.notificationType && filters.notificationType !== 'all') {
        query = query.eq('notification_type', filters.notificationType);
      }
      if (filters?.recipient && filters.recipient.trim()) {
        // Match the address anywhere in the recipients array. `cs` (contains)
        // needs an exact element, so we filter client-side after fetch for a
        // substring match; here we still narrow server-side when it looks like
        // a full address to keep payloads small.
        const term = filters.recipient.trim();
        if (term.includes('@')) {
          query = query.contains('recipients', [term]);
        }
      }
      if (filters?.permitNo && filters.permitNo.trim()) {
        // Match either the dedicated permit/gate-pass number column or the
        // subject line (covers WP-… and GP-… references in generic notifications).
        const term = filters.permitNo.trim().replace(/[,()]/g, '');
        query = query.or(
          `permit_no.ilike.%${term}%,subject.ilike.%${term}%`,
        );
      }
      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as EmailDeliveryLog[];

      // Client-side substring match for partial recipient searches.
      if (filters?.recipient && filters.recipient.trim() && !filters.recipient.includes('@')) {
        const term = filters.recipient.trim().toLowerCase();
        rows = rows.filter((r) =>
          (r.recipients ?? []).some((addr) => addr.toLowerCase().includes(term)),
        );
      }

      return rows;
    },
  });
}
