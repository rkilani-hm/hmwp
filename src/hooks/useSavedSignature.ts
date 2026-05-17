import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// =====================================================================
// useSavedSignature — load + persist the current user's saved
// signature and initials.
// =====================================================================
//
// Storage: profiles.signature_data + profiles.initials_data
// (PNG data URLs). See migration 20260517110000_user_saved_signatures.
//
// Used by:
//   - Settings page — to display / capture / replace
//   - SecureApprovalDialog — to pre-load the signature pad on open

export interface SavedSignature {
  signature_data: string | null;
  initials_data: string | null;
  signature_updated_at: string | null;
}

export const SAVED_SIGNATURE_KEY = ['saved-signature'];

export function useSavedSignature() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...SAVED_SIGNATURE_KEY, user?.id],
    queryFn: async (): Promise<SavedSignature | null> => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('signature_data, initials_data, signature_updated_at')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('useSavedSignature query failed:', error);
        return null;
      }
      return (data as SavedSignature | null) ?? null;
    },
    enabled: !!user?.id,
    staleTime: 60_000, // signatures don't change often
  });
}

// =====================================================================
// useUpdateSavedSignature — save one or both fields
// =====================================================================
//
// Pass `signature` and/or `initials` as a data URL to set, or `null`
// to clear. Omitted fields are not touched. Returns the updated row.

export function useUpdateSavedSignature() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      signature?: string | null;
      initials?: string | null;
    }): Promise<SavedSignature> => {
      if (!user?.id) throw new Error('Not authenticated');

      const update: Record<string, string | null> = {};
      if (input.signature !== undefined) update.signature_data = input.signature;
      if (input.initials !== undefined) update.initials_data = input.initials;

      if (Object.keys(update).length === 0) {
        throw new Error('Nothing to update — provide signature or initials');
      }

      const { data, error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', user.id)
        .select('signature_data, initials_data, signature_updated_at')
        .single();

      if (error) throw error;
      return data as SavedSignature;
    },
    onSuccess: (data) => {
      qc.setQueryData([...SAVED_SIGNATURE_KEY, user?.id], data);
      qc.invalidateQueries({ queryKey: SAVED_SIGNATURE_KEY });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save signature');
    },
  });
}
