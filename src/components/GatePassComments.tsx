import { useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Lock, Users, Globe, Loader2, MessageSquare, Trash2, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsTenantOnly } from '@/hooks/useIsTenantOnly';
import {
  useGatePassComments,
  useAddGatePassComment,
  useDeleteGatePassComment,
  type CommentTier,
  type GatePassComment,
} from '@/hooks/useGatePassComments';
import { cn } from '@/lib/utils';

/**
 * GatePassComments — list + composer for the three-tier comment model
 * (spec: comment-visibility-tiers.md). Gate passes.
 *
 * Visibility is enforced SERVER-SIDE by RLS: the list renders exactly the
 * rows the DB returns for the current user, with no client-side security
 * filtering. The composer fails CLOSED to mirror the DB INSERT policy:
 *   - tenants: no tier selector, comments are forced tier='public';
 *   - non-tenant with no department: the Confidential option is disabled.
 */

interface TierMeta {
  label: string;
  badgeLabel: string;
  hint: string;
  icon: typeof Lock;
  badgeClassName: string;
}

const TIER_META: Record<CommentTier, TierMeta> = {
  confidential: {
    label: 'Confidential',
    badgeLabel: 'Confidential — same department',
    hint: 'Visible only to members of your department.',
    icon: Lock,
    badgeClassName: 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  },
  internal: {
    label: 'Internal',
    badgeLabel: 'Internal — staff only',
    hint: 'Visible to all internal staff, hidden from tenants.',
    icon: Users,
    badgeClassName: 'border-border bg-muted text-muted-foreground',
  },
  public: {
    label: 'Public',
    badgeLabel: 'Public',
    hint: 'Visible to everyone, including the tenant.',
    icon: Globe,
    badgeClassName: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
};

function TierBadge({ tier }: { tier: CommentTier }) {
  const meta = TIER_META[tier];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn('gap-1 font-medium', meta.badgeClassName)}>
      <Icon className="h-3 w-3" />
      {meta.badgeLabel}
    </Badge>
  );
}

function CommentRow({
  comment,
  canDelete,
  onDelete,
  deleting,
}: {
  comment: GatePassComment;
  canDelete: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  let when = '';
  try {
    when = formatDistanceToNow(parseISO(comment.created_at), { addSuffix: true });
  } catch {
    when = '';
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">
            {comment.author_name || 'Unknown user'}
          </span>
          {when && <span className="text-xs text-muted-foreground">{when}</span>}
        </div>
        <div className="flex items-center gap-1">
          <TierBadge tier={comment.tier} />
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              disabled={deleting}
              title="Delete comment"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{comment.body}</p>
    </div>
  );
}

export function GatePassComments({ gatePassId }: { gatePassId: string }) {
  const { user, profile, roles } = useAuth();
  const isTenantOnly = useIsTenantOnly();
  const isAdmin = roles.includes('admin');
  // Fail-closed: only a non-tenant who actually HAS a department may post
  // confidential comments (matches the DB INSERT check).
  const hasDepartment = !!profile?.department_id;
  const canPostConfidential = !isTenantOnly && hasDepartment;

  const { data: comments = [], isLoading } = useGatePassComments(gatePassId);
  const addComment = useAddGatePassComment();
  const deleteComment = useDeleteGatePassComment();

  const [body, setBody] = useState('');
  // Tenants are forced to 'public'; everyone else defaults to 'internal'.
  const [tier, setTier] = useState<CommentTier>('internal');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const effectiveTier: CommentTier = isTenantOnly ? 'public' : tier;
  const canSubmit = body.trim().length > 0 && !addComment.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    addComment.mutate(
      { gatePassId, tier: effectiveTier, body },
      {
        onSuccess: () => {
          setBody('');
          if (!isTenantOnly) setTier('internal');
        },
      },
    );
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    deleteComment.mutate(
      { id, gatePassId },
      { onSettled: () => setDeletingId(null) },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          Comments
        </CardTitle>
        <CardDescription>
          Discuss this gate pass. Each comment has a visibility tier — the server decides
          who can see it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No comments yet.</p>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                canDelete={isAdmin || c.author_id === user?.id}
                deleting={deletingId === c.id}
                onDelete={() => handleDelete(c.id)}
              />
            ))}
          </div>
        )}

        {/* Composer */}
        <div className="space-y-3 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="gate-pass-comment-body">Add a comment</Label>
            <Textarea
              id="gate-pass-comment-body"
              placeholder="Write a comment..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
            />
          </div>

          {isTenantOnly ? (
            // Tenants: no tier selector — comments are public by definition.
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Visible to everyone.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Label className="text-sm sm:w-24 shrink-0">Visibility</Label>
                <Select value={tier} onValueChange={(v) => setTier(v as CommentTier)}>
                  <SelectTrigger className="sm:max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">
                      {TIER_META.internal.label} — staff only
                    </SelectItem>
                    <SelectItem value="confidential" disabled={!canPostConfidential}>
                      {TIER_META.confidential.label} — same department
                    </SelectItem>
                    <SelectItem value="public">
                      {TIER_META.public.label} — everyone
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">{TIER_META[tier].hint}</p>
              {!canPostConfidential && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Assign a department to post confidential comments.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={!canSubmit} size="sm" className="gap-1.5">
              {addComment.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Post comment
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
