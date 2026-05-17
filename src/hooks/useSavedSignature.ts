import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Saved signature/initials live on the user's profile so they can be
 * pre-loaded into every approval pad, sparing approvers from re-drawing
 * the same scribble dozens of times a day.
 */
export interface SavedSignature {
  signature: string | null;
  initials: string | null;
  updatedAt: string | null;
}

const QUERY_KEY = ['saved-signature'] as const;

async function fetchSavedSignature(userId: string): Promise<SavedSignature> {
  const { data, error } = await supabase
    .from('profiles')
    .select('signature_data, initials_data, signature_updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return {
    signature: (data as any)?.signature_data ?? null,
    initials: (data as any)?.initials_data ?? null,
    updatedAt: (data as any)?.signature_updated_at ?? null,
  };
}

export function useSavedSignature() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...QUERY_KEY, user?.id],
    queryFn: () => fetchSavedSignature(user!.id),
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async (
      payload: { signature?: string | null; initials?: string | null },
    ) => {
      if (!user?.id) throw new Error('Not signed in');
      const update: Record<string, unknown> = {};
      if ('signature' in payload) update.signature_data = payload.signature;
      if ('initials' in payload) update.initials_data = payload.initials;
      const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isSaving: save.isPending,
    save: save.mutateAsync,
    refetch: query.refetch,
  };
}
