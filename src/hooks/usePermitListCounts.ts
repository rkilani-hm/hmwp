import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// RLS-scoped exact counts for the All Permits header/tabs, applying the same
// search + status filters as the list so totals stay correct past 1000 rows.
export function usePermitListCounts(search: string, status: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['work-permits', 'list-counts', search, status],
    enabled: !!user,
    queryFn: async () => {
      const count = async (archived: boolean) => {
        let q = supabase.from('work_permits').select('id', { count: 'exact', head: true });
        q = archived ? q.eq('is_archived', true) : q.not('is_archived', 'is', true);
        const s = search.trim().replace(/[,()*%\\]/g, ' ').trim();
        if (s) {
          const p = `%${s}%`;
          q = q.or(`permit_no.ilike.${p},contractor_name.ilike.${p},work_description.ilike.${p}`);
        }
        if (status === 'pending') {
          q = q.or('status.like.pending*,status.eq.submitted,status.eq.under_review');
        } else if (status !== 'all') {
          q = q.eq('status', status as any);
        }
        const { count: c, error } = await q;
        if (error) throw error;
        return c ?? 0;
      };
      const [active, archived] = await Promise.all([count(false), count(true)]);
      return { active, archived };
    },
  });
}
