import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * useEntityComments — entity-parameterized merge of usePermitComments and
 * useGatePassComments (audit item D1). Read + write the per-entity comment
 * table (permit_comments / gate_pass_comments) for the three-tier comment
 * model (spec: comment-visibility-tiers.md).
 *
 * SECURITY MODEL: visibility is enforced SERVER-SIDE by RLS. The SELECT
 * policy is tier-filtered (public → everyone; internal → non-tenant staff;
 * confidential → same department as author; author & admin always). The
 * client simply selects every row for the entity and renders whatever the
 * DB returns — there is NO client-side security filtering here. The tier
 * badges in the UI are purely informational.
 *
 * The generated supabase types don't yet include these tables, so all calls
 * cast through `as any` (the codebase already does this for not-yet-typed
 * tables; here the table name is also a variable). The local EntityComment
 * type documents the shape.
 */

export type CommentEntity = 'permit' | 'gate_pass';

interface CommentEntityConfig {
  table: string;
  fk: string;
  key: string;
}

const COMMENT_CFG: Record<CommentEntity, CommentEntityConfig> = {
  permit: { table: 'permit_comments', fk: 'permit_id', key: 'permit-comments' },
  gate_pass: { table: 'gate_pass_comments', fk: 'gate_pass_id', key: 'gate-pass-comments' },
} as const;

export type CommentTier = 'confidential' | 'internal' | 'public';

export interface EntityComment {
  id: string;
  /** One of these is present depending on the entity. */
  permit_id?: string;
  gate_pass_id?: string;
  approval_id: string | null;
  author_id: string;
  author_department_id: string | null;
  tier: CommentTier;
  body: string;
  created_at: string;
  /** Author display name, snapshotted onto the row by the insert trigger
   *  (profiles RLS blocks reading other users' profiles client-side). */
  author_name?: string | null;
}

export function useEntityComments(entity: CommentEntity, id: string | undefined) {
  const { user } = useAuth();
  const cfg = COMMENT_CFG[entity];

  return useQuery({
    queryKey: [cfg.key, id],
    enabled: !!id && !!user,
    queryFn: async (): Promise<EntityComment[]> => {
      // RLS filters rows by tier server-side; we just select what we're
      // allowed to read, ordered oldest-first (conversation order).
      const { data, error } = await (supabase as any)
        .from(cfg.table)
        .select('*')
        .eq(cfg.fk, id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // author_name is denormalized onto the row by the insert trigger, so no
      // profiles lookup is needed (and profiles RLS would block it anyway).
      return (data ?? []) as EntityComment[];
    },
  });
}

export interface AddEntityCommentInput {
  id: string;
  tier: CommentTier;
  body: string;
  /** Optional link to a specific approval step. */
  approvalId?: string | null;
}

export function useAddEntityComment(entity: CommentEntity) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const cfg = COMMENT_CFG[entity];

  return useMutation({
    mutationFn: async ({ id, tier, body, approvalId }: AddEntityCommentInput) => {
      if (!user) throw new Error('You must be signed in to comment.');
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Comment cannot be empty.');

      // Explicitly set author_id to the current user to satisfy the RLS
      // INSERT check (a BEFORE-INSERT trigger also defaults it from
      // auth.uid() and snapshots author_department_id).
      const { error } = await (supabase as any).from(cfg.table).insert({
        [cfg.fk]: id,
        tier,
        body: trimmed,
        author_id: user.id,
        approval_id: approvalId ?? null,
      });

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [cfg.key, variables.id] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Failed to post comment. Please try again.';
      toast.error(message);
    },
  });
}

export function useDeleteEntityComment(entity: CommentEntity) {
  const queryClient = useQueryClient();
  const cfg = COMMENT_CFG[entity];

  return useMutation({
    // id is carried only to scope the cache invalidation.
    mutationFn: async ({ commentId }: { commentId: string; id: string }) => {
      // RLS restricts DELETE to the comment's author or an admin.
      const { error } = await (supabase as any).from(cfg.table).delete().eq('id', commentId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [cfg.key, variables.id] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to delete comment.';
      toast.error(message);
    },
  });
}
