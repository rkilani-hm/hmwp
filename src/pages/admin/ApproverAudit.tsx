import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Users,
  Workflow,
  Inbox as InboxIcon,
} from 'lucide-react';
import {
  useApproverAudit,
  useNotifyPendingApproversBackfill,
  useReassignAllPermits,
  useSyncProfileEmails,
  type ApproverAuditRow,
} from '@/hooks/useApproverAudit';

/**
 * Admin diagnostic page: shows which roles are correctly wired up
 * (in workflows, with users, no orphaned pending permits) and which
 * have gaps. Used when an approver reports "I don't see permits in
 * my inbox" — the table makes the exact misconfiguration obvious.
 *
 * Plus a "Send missing notifications" action that runs the backfill
 * RPC — useful as a catch-up after the role assignment is fixed.
 */
export default function ApproverAudit() {
  const { data: rows, isLoading, refetch, isFetching } = useApproverAudit();
  const backfill = useNotifyPendingApproversBackfill();
  const reassign = useReassignAllPermits();
  const syncEmails = useSyncProfileEmails();

  const orphanedCount =
    rows?.filter((r) => r.status === 'orphaned_pending').length ?? 0;
  const noUsersCount =
    rows?.filter((r) => r.status === 'no_users').length ?? 0;
  const hasIssues = orphanedCount > 0 || noUsersCount > 0;

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Approver setup audit</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Each row shows a role used in workflows or held by a user. Check
            the status column to spot gaps that would prevent approvers from
            seeing permits in their inbox.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => syncEmails.mutate()}
            disabled={syncEmails.isPending}
            title="Copy email from auth.users into profiles.email for any user whose profile email is empty. Fix for 'approvers see permits but get no email'. Idempotent; safe to re-run."
          >
            {syncEmails.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Mail className="w-4 h-4 mr-2" />
            )}
            Sync profile emails
          </Button>
          <Button
            variant="outline"
            onClick={() => reassign.mutate()}
            disabled={reassign.isPending}
            title="Reconcile every active permit against the current workflow configuration. Skips pending rows for roles no longer in the workflow, inserts rows for required roles missing. Safe to re-run; idempotent."
          >
            {reassign.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Workflow className="w-4 h-4 mr-2" />
            )}
            Reassign active permits
          </Button>
          <Button
            onClick={() => backfill.mutate()}
            disabled={backfill.isPending}
          >
            {backfill.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send missing notifications
          </Button>
        </div>
      </div>

      {hasIssues && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {orphanedCount > 0
              ? `${orphanedCount} role${orphanedCount === 1 ? '' : 's'} ${orphanedCount === 1 ? 'has' : 'have'} pending permits but no assigned users`
              : `${noUsersCount} role${noUsersCount === 1 ? '' : 's'} ${noUsersCount === 1 ? 'is' : 'are'} on a workflow but ${noUsersCount === 1 ? 'has' : 'have'} no users`}
          </AlertTitle>
          <AlertDescription className="mt-1">
            Approvers in these roles will not see permits in their inbox or
            receive email notifications. Open Approvers Management and assign
            the role to at least one user, then click "Send missing
            notifications" to catch up.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role configuration</CardTitle>
          <CardDescription>
            Worst-configured roles first. "Orphaned pending" is the most
            critical state — permits are sitting in nobody's inbox.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No roles found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">
                    <Workflow className="w-3.5 h-3.5 inline mr-1" />
                    In workflows
                  </TableHead>
                  <TableHead className="text-center">
                    <Users className="w-3.5 h-3.5 inline mr-1" />
                    Users
                  </TableHead>
                  <TableHead className="text-center">
                    <InboxIcon className="w-3.5 h-3.5 inline mr-1" />
                    Pending
                  </TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <AuditRowItem key={row.role_id} row={row} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4" />
            How notifications work
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 prose-sm">
          <p>
            When a permit is submitted, a DB trigger reads the work type's
            workflow steps and creates a pending row in{' '}
            <code className="text-xs">permit_approvals</code> for each
            required role. The inbox query reads{' '}
            <code className="text-xs">permit_active_approvers</code> (a view
            on that table filtered to the currently-active step), and email
            notifications fan out to every user holding any of those active
            roles.
          </p>
          <p>
            If an approver doesn't see a permit, one of three things is
            usually wrong: (a) the user account has no row in{' '}
            <code className="text-xs">user_roles</code> for the role; (b) the
            work type's workflow has no step referencing the role; (c) (rare)
            a database error prevented the trigger from inserting the
            pending row. This page shows (a) and (b) directly.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditRowItem({ row }: { row: ApproverAuditRow }) {
  return (
    <TableRow className={row.status === 'orphaned_pending' ? 'bg-destructive/5' : ''}>
      <TableCell>
        <div className="font-medium">{row.role_label || row.role_name}</div>
        <div className="text-xs text-muted-foreground">{row.role_name}</div>
      </TableCell>
      <TableCell className="text-center font-mono text-sm">
        {row.workflow_step_count}
      </TableCell>
      <TableCell className="text-center font-mono text-sm">
        {row.user_count}
      </TableCell>
      <TableCell className="text-center font-mono text-sm">
        {row.pending_permit_count}
      </TableCell>
      <TableCell>
        <StatusBadge status={row.status} />
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: ApproverAuditRow['status'] }) {
  const config = {
    orphaned_pending: {
      icon: AlertTriangle,
      label: 'Orphaned — pending permits, no users',
      variant: 'destructive' as const,
    },
    no_users: {
      icon: AlertTriangle,
      label: 'No users assigned',
      variant: 'destructive' as const,
    },
    no_workflow_steps: {
      icon: AlertTriangle,
      label: 'Not in any workflow',
      variant: 'outline' as const,
    },
    unused: {
      icon: AlertTriangle,
      label: 'Unused',
      variant: 'outline' as const,
    },
    ok: {
      icon: CheckCircle2,
      label: 'OK',
      variant: 'outline' as const,
    },
  }[status];

  const Icon = config.icon;
  return (
    <Badge
      variant={config.variant}
      className={
        status === 'ok'
          ? 'border-success text-success bg-success/10 gap-1.5'
          : 'gap-1.5'
      }
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}
