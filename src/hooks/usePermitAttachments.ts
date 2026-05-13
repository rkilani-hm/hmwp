import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * permit_attachments row shape.
 *
 * Populated when a permit is submitted via the new (post-2026-05-13)
 * DocumentsStep that categorizes uploads and runs AI extraction on
 * IDs. Older permits won't have rows here — the consumer should
 * fall back to permit.attachments (the legacy text[] of file paths)
 * when this returns an empty array.
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
 * Fetch all permit_attachments rows for a given permit.
 *
 * Returns empty array for legacy permits where no per-file metadata
 * was captured at upload time. RLS gates visibility to requester /
 * approvers / admins — same scope as the parent permit.
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
        .order('document_type', { ascending: true })  // IDs first
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as PermitAttachment[];
    },
  });
}
