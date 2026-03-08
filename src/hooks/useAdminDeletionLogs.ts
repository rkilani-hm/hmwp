import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdminDeletionLog {
  id: string;
  record_type: string;
  record_id: string;
  record_identifier: string;
  record_details: string | null;
  action: string;
  performed_by: string;
  performed_by_name: string;
  performed_by_email: string;
  created_at: string;
}

export function useAdminDeletionLogs(filters?: {
  actionType?: string;
  recordType?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: ['admin-deletion-logs', filters],
    queryFn: async () => {
      let query = supabase
        .from('admin_deletion_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.actionType && filters.actionType !== 'all') {
        query = query.eq('action', filters.actionType);
      }
      if (filters?.recordType && filters.recordType !== 'all') {
        query = query.eq('record_type', filters.recordType);
      }
      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AdminDeletionLog[];
    },
  });
}
