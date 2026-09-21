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

/**
 * Manually (re-)archive one already-approved permit's PDF to SharePoint.
 * Useful for permits approved before archiving was enabled, or to retry a
 * failed upload. Admin-only (the edge function authorises admins).
 */
export function useReArchivePermit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (permitId: string) => {
      const { data, error } = await supabase.functions.invoke('archive-permit-to-sharepoint', { body: { permitId } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { success?: boolean; skipped?: boolean; message?: string; webUrl?: string };
    },
    onSuccess: (d) => {
      if (d?.skipped) toast.info(d.message || 'Nothing to archive.');
      else if (d?.success) toast.success('Saved to SharePoint.');
      else toast.error('Archive did not complete.');
      qc.invalidateQueries({ queryKey: ['sharepoint-uploads'] });
    },
    onError: (e: any) => toast.error('SharePoint archive failed: ' + (e?.message || 'unknown error')),
  });
}

/** Test the connection: uploads then deletes a marker file to prove write access. */
export function useTestSharePoint() {
  const qc = useQueryClient();
  return useMutation({
    // `settings` carries the on-screen (possibly unsaved) destination so the
    // test reflects what the admin is currently editing, not the saved row.
    mutationFn: async (settings?: Partial<Omit<SharePointSettings, 'id'>>) => {
      const { data, error } = await supabase.functions.invoke('archive-permit-to-sharepoint', {
        body: { test: true, settings: settings ?? undefined },
      });
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
