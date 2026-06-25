import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * useGatePassComments — read + write `public.gate_pass_comments` (the
 * gate-pass analogue of usePermitComments; spec: comment-visibility-tiers.md).
 *
 * SECURITY MODEL: visibility is enforced SERVER-SIDE by RLS. The SELECT
 * policy is tier-filtered (public → everyone; internal → non-tenant staff;
 * confidential → same department as author; author & admin always). The
 * client simply selects every row for the gate pass and renders whatever the
 * DB returns — there is NO client-side security filtering here. The tier
 * badges in the UI are purely informational.
 *
 * The generated supabase types don't yet include `gate_pass_comments`, so the
 * call sites cast through `as any` (the codebase already does this for
 * not-yet-typed tables). The local GatePassComment type documents the shape.
 */

export type CommentTier = 'confidential' | 'internal' | 'public';

export interface GatePassComment {
  id: string;
  gate_pass_id: string;
  approval_id: string | null;
  author_id: string;
  author_department_id: string | null;
  tier: CommentTier;
  body: string;
  created_at: string;
  /** Resolved client-side from profiles for display; not a DB column. */
  author_name?: string | null;
}

export function useGatePassComments(gatePassId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['gate-pass-comments', gatePassId],
    enabled: !!gatePassId && !!user,
    queryFn: async (): Promise<GatePassComment[]> => {
      // RLS filters rows by tier server-side; we just select what we're
      // allowed to read, ordered oldest-first (conversation order).
      const { data, error } = await (supabase as any)
        .from('gate_pass_comments')
        .select('*')
        .eq('gate_pass_id', gatePassId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as GatePassComment[];
      if (rows.length === 0) return [];

      // Resolve author display names. `profiles` is selectable by any
      // authenticated user (select id, full_name).
      const authorIds = Array.from(new Set(rows.map((r) => r.author_id).filter(Boolean)));
      const nameById = new Map<string, string | null>();
      if (authorIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', authorIds);
        if (profilesError) {
          // Non-fatal: fall back to no names rather than failing the list.
          console.error('Failed to resolve comment author names:', profilesError);
        } else {
          for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
            nameById.set(p.id, p.full_name);
          }
        }
      }

      return rows.map((r) => ({ ...r, author_name: nameById.get(r.author_id) ?? null }));
    },
  });
}

export interface AddGatePassCommentInput {
  gatePassId: string;
  tier: CommentTier;
  body: string;
  /** Optional link to a specific approval step. */
  approvalId?: string | null;
}

export function useAddGatePassComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ gatePassId, tier, body, approvalId }: AddGatePassCommentInput) => {
      if (!user) throw new Error('You must be signed in to comment.');
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Comment cannot be empty.');

      // Explicitly set author_id to the current user to satisfy the RLS
      // INSERT check (a BEFORE-INSERT trigger also defaults it from
      // auth.uid() and snapshots author_department_id).
      const { error } = await (supabase as any).from('gate_pass_comments').insert({
        gate_pass_id: gatePassId,
        tier,
        body: trimmed,
        author_id: user.id,
        approval_id: approvalId ?? null,
      });

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['gate-pass-comments', variables.gatePassId] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Failed to post comment. Please try again.';
      toast.error(message);
    },
  });
}

export function useDeleteGatePassComment() {
  const queryClient = useQueryClient();

  return useMutation({
    // gatePassId is carried only to scope the cache invalidation.
    mutationFn: async ({ id }: { id: string; gatePassId: string }) => {
      // RLS restricts DELETE to the comment's author or an admin.
      const { error } = await (supabase as any).from('gate_pass_comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['gate-pass-comments', variables.gatePassId] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to delete comment.';
      toast.error(message);
    },
  });
}
