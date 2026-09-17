import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// -----------------------------------------------------------------------------
// SharePoint archive configuration — where approved permit PDFs are saved.
// Backed by sharepoint_settings + sharepoint_uploads (20260917120000). Table
// names are cast to `any` because they postdate the generated Supabase types.
// -----------------------------------------------------------------------------

export interface SharePointSettings {
  id: boolean;
  enabled: boolean;
  site_hostname: string | null;
  site_path: string | null;
  library_name: string | null;
  folder_path: string | null;
  filename_template: string | null;
  timezone: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_message: string | null;
}

export interface SharePointUpload {
  id: string;
  permit_no: string | null;
  status: string;          // uploaded | failed | skipped
  web_url: string | null;
  folder_path: string | null;
  error_message: string | null;
  created_at: string;
}

const db = supabase as any;

export function useSharePointSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['sharepoint-settings'],
    enabled: !!user,
    queryFn: async (): Promise<SharePointSettings | null> => {
      const { data, error } = await db.from('sharepoint_settings').select('*').eq('id', true).maybeSingle();
      if (error) throw error;
      return (data as SharePointSettings) ?? null;
    },
  });
}

export function useSharePointUploads(limit = 15) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['sharepoint-uploads', limit],
    enabled: !!user,
    queryFn: async (): Promise<SharePointUpload[]> => {
      const { data, error } = await db.from('sharepoint_uploads')
        .select('id, permit_no, status, web_url, folder_path, error_message, created_at')
        .order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as SharePointUpload[];
    },
  });
}

export function useSaveSharePointSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<SharePointSettings, 'id'>>) => {
      const { error } = await db.from('sharepoint_settings')
        .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('SharePoint settings saved.');
      qc.invalidateQueries({ queryKey: ['sharepoint-settings'] });
    },
    onError: (e: any) => toast.error('Could not save settings: ' + (e?.message || 'unknown error')),
  });
}

/** Test the connection: uploads then deletes a marker file to prove write access. */
export function useTestSharePoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('archive-permit-to-sharepoint', { body: { test: true } });
      if (error) throw error;
      return data as { success: boolean; message?: string; error?: string };
    },
    onSuccess: (d) => {
      if (d?.success) toast.success(d.message || 'Connection OK.');
      else toast.error('Test failed: ' + (d?.error || 'unknown error'));
      qc.invalidateQueries({ queryKey: ['sharepoint-settings'] });
    },
    onError: (e: any) => toast.error('Test failed: ' + (e?.message || 'unknown error')),
  });
}
