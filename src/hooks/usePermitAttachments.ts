import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Row from permit_attachments. Mirrors the table schema 1:1.
 * Some fields are nullable per column definitions.
 */
export interface PermitAttachment {
  id: string;
  permit_id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  document_type: 'civil_id' | 'driving_license' | 'other';
  extracted_name: string | null;
  extracted_id_number: string | null;
  extracted_expiry_date: string | null;
  extracted_issue_date: string | null;
  extracted_nationality: string | null;
  is_valid: boolean | null;
  extraction_status: 'pending' | 'processing' | 'success' | 'failed' | 'skipped';
  extraction_error: string | null;
  extracted_at: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Returns all permit_attachments rows for a given permit, ordered by
 * upload time. Empty list (not error) when:
 *   - permit was created BEFORE the AI extraction feature shipped
 *     (no rows in this table; legacy attachments text[] column on
 *     work_permits is the source of truth in that case)
 *   - permit has no attachments at all
 *
 * Caller can distinguish by checking both the length here and the
 * legacy work_permits.attachments array.
 */
export function usePermitAttachments(permitId: string | undefined) {
  return useQuery<PermitAttachment[]>({
    queryKey: ['permit-attachments', permitId],
    enabled: !!permitId,
    queryFn: async () => {
      if (!permitId) return [];
      const { data, error } = await supabase
        .from('permit_attachments')
        .select('*')
        .eq('permit_id', permitId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data as PermitAttachment[]) ?? [];
    },
  });
}
