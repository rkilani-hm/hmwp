import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ActorType } from '@/utils/actorVerb';

/**
 * useActorTypes — resolve actor_type for a set of user ids in one query.
 *
 * Spec: departments-and-reviewer-flag.md (R5). The approval timelines
 * render historical rows whose verb ("Approved" vs "Reviewed") depends on
 * the ACTING user's actor_type. Each completed approval row carries an
 * `approver_user_id`; we batch-fetch the actor_type for that set of ids
 * with a single `profiles` select, then label each row from the result.
 *
 * Returns a Map<userId, actor_type>. Callers default to approver wording
 * (via approveVerb) when a user id is absent / unresolved.
 *
 * profiles.actor_type may not be in the generated supabase types yet, so
 * the call is cast to `any` (consistent with the rest of the codebase).
 */
export function useActorTypes(userIds: Array<string | null | undefined>) {
  // Stable, de-duped, non-null id list for the query key + the `.in()`.
  const ids = Array.from(
    new Set(userIds.filter((id): id is string => !!id)),
  ).sort();

  return useQuery({
    queryKey: ['actor-types', ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, ActorType>> => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('id, actor_type')
        .in('id', ids);

      if (error) throw error;

      const map = new Map<string, ActorType>();
      for (const row of (data ?? []) as Array<{ id: string; actor_type: string | null }>) {
        map.set(row.id, row.actor_type === 'reviewer' ? 'reviewer' : 'approver');
      }
      return map;
    },
  });
}
