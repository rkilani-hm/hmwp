import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Settings2, CheckCircle, XCircle, RotateCcw, Forward, FileText, Ban, Bell, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { usePermitApprovals } from '@/hooks/usePermitApprovals';

interface ActivityLogEntry {
  id: string;
  type: 'activity' | 'workflow_modification' | 'approval' | 'creation';
  action: string;
  performed_by: string;
  performed_by_email?: string;
  details?: string | null;
  created_at: string;
  status?: 'approved' | 'rejected' | 'pending';
  modification_type?: string;
  reason?: string | null;
}

interface PermitActivityLogProps {
  permitId: string;
  permitCreatedAt: string;
  requesterName: string;
  // The legacy `approvals` prop has been removed — the component now
  // reads from the permit_approvals table directly via
  // usePermitApprovals(). Callers don't need to construct the legacy
  // per-role approval object anymore. This decouples the activity
  // log from the per-role columns that Phase 2c-5c will drop.
}

const ROLE_LABELS: Record<string, string> = {
  customer_service: 'Customer Service',
  helpdesk: 'Helpdesk',
  cr_coordinator: 'CR Coordinator',
  head_cr: 'Head of CR',
  pm: 'PM',
  pd: 'PD',
  bdcr: 'BDCR',
  mpr: 'MPR',
  it: 'IT',
  fitout: 'Fit-Out',
  ecovert_supervisor: 'Ecovert Supervisor',
  pmd_coordinator: 'PMD Coordinator',
  fmsp_approval: 'FMSP',
};

export function PermitActivityLog({ permitId, permitCreatedAt, requesterName }: PermitActivityLogProps) {
  // Approval rows from permit_approvals (post-Phase-2c source of truth).
  // One row per role; we filter to terminal statuses below.
  const { data: approvalRows, isLoading: isLoadingApprovals } = usePermitApprovals(permitId);

  // Fetch activity logs (legacy free-form action log written by various
  // mutations; persists alongside permit_approvals).
  const { data: activityLogs, isLoading: isLoadingActivity } = useQuery({
    queryKey: ['permit-activity-logs', permitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('permit_id', permitId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  // Fetch workflow audit logs
  const { data: workflowAuditLogs, isLoading: isLoadingAudit } = useQuery({
    queryKey: ['permit-workflow-audit', permitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permit_workflow_audit')
        .select('*')
        .eq('permit_id', permitId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const isLoading = isLoadingApprovals || isLoadingActivity || isLoadingAudit;

  // Build approval entries from permit_approvals rows. Show one entry
  // per terminal-status row (approved or rejected); skipped and
  // pending rows aren't surfaced — skipped is silent, pending hasn't
  // happened yet.
  const approvalEntries: ActivityLogEntry[] = (approvalRows ?? [])
    .filter(row => row.status === 'approved' || row.status === 'rejected')
    .map(row => {
      const roleLabel = ROLE_LABELS[row.role_name] ?? row.role_name;
      return {
        id: `approval-${row.role_name}`,
        type: 'approval' as const,
        action: row.status === 'approved'
          ? `${roleLabel} Approved`
          : `${roleLabel} Rejected`,
        performed_by: row.approver_name ?? 'Unknown',
        details: row.comments,
        // Use approved_at when present; fall back to updated_at for
        // older rows that backfilled without an explicit timestamp.
        created_at: row.approved_at ?? row.updated_at ?? permitCreatedAt,
        status: row.status as 'approved' | 'rejected',
      };
    });

  function getWorkflowModificationTitle(type: string): string {
    switch (type) {
      case 'work_type_change':
        return 'Work Type Changed';
      case 'step_toggle':
        return 'Workflow Step Modified';
      case 'custom_workflow':
        return 'Custom Workflow Applied';
      default:
        return 'Workflow Modified';
    }
  }

  // Combine and sort all entries chronologically
  const allEntries: ActivityLogEntry[] = [
    // Always include permit creation as first entry
    {
      id: 'created',
      type: 'creation' as const,
      action: 'Permit Created',
      performed_by: requesterName,
      created_at: permitCreatedAt,
    },
    // Approval entries from permit_approvals
    ...approvalEntries,
    // Activity logs (filter out duplicates with approval entries)
    ...(activityLogs || [])
      .filter(log => {
        const actionLower = log.action.toLowerCase();
        const isDuplicateApproval = approvalEntries.some(entry =>
          entry.action.toLowerCase() === actionLower
        );
        return !isDuplicateApproval;
      })
      .map(log => ({
        id: log.id,
        type: 'activity' as const,
        action: log.action,
        performed_by: log.performed_by,
        details: log.details,
        created_at: log.created_at,
      })),
    // Workflow audit logs
    ...(workflowAuditLogs || []).map(log => ({
      id: log.id,
      type: 'workflow_modification' as const,
      action: getWorkflowModificationTitle(log.modification_type),
      performed_by: log.modified_by_name,
      performed_by_email: log.modified_by_email,
      details: log.reason,
      created_at: log.created_at || '',
      modification_type: log.modification_type,
      reason: log.reason,
    })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  function getActionIcon(entry: ActivityLogEntry) {
    if (entry.type === 'workflow_modification') {
      return <Settings2 className="w-3 h-3" />;
    }
    if (entry.type === 'creation') {
      return <FileText className="w-3 h-3" />;
    }
    if (entry.type === 'approval') {
      return entry.status === 'approved'
        ? <CheckCircle className="w-3 h-3" />
        : <XCircle className="w-3 h-3" />;
    }

    const actionLower = entry.action.toLowerCase();
    if (actionLower.includes('approved')) return <CheckCircle className="w-3 h-3" />;
    if (actionLower.includes('rejected')) return <XCircle className="w-3 h-3" />;
    if (actionLower.includes('rework'))   return <RotateCcw className="w-3 h-3" />;
    if (actionLower.includes('forward'))  return <Forward className="w-3 h-3" />;
    if (actionLower.includes('cancel'))   return <Ban className="w-3 h-3" />;
    if (actionLower.includes('notification') || actionLower.includes('resend')) return <Bell className="w-3 h-3" />;
    if (actionLower.includes('submit'))   return <Clock className="w-3 h-3" />;
    if (actionLower.includes('pdf') || actionLower.includes('document')) return <FileText className="w-3 h-3" />;
    return <CheckCircle className="w-3 h-3" />;
  }

  function getActionColor(entry: ActivityLogEntry): string {
    if (entry.type === 'workflow_modification') return 'bg-warning text-warning-foreground';
    if (entry.type === 'creation') return 'bg-primary text-primary-foreground';
    if (entry.type === 'approval') {
      return entry.status === 'approved'
        ? 'bg-success text-success-foreground'
        : 'bg-destructive text-destructive-foreground';
    }

    const actionLower = entry.action.toLowerCase();
    if (actionLower.includes('rejected') || actionLower.includes('cancel')) return 'bg-destructive text-destructive-foreground';
    if (actionLower.includes('rework'))  return 'bg-warning text-warning-foreground';
    if (actionLower.includes('forward')) return 'bg-accent text-accent-foreground';
    if (actionLower.includes('submit'))  return 'bg-primary text-primary-foreground';
    return 'bg-success text-success-foreground';
  }

  function getBadge(entry: ActivityLogEntry) {
    if (entry.type === 'workflow_modification') {
      return (
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px] py-0">
          <Settings2 className="w-2.5 h-2.5 mr-1" />
          Workflow
        </Badge>
      );
    }
    if (entry.type === 'approval' && entry.status === 'rejected') {
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] py-0">
          Rejected
        </Badge>
      );
    }
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display">Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-display">Activity Log</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {allEntries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${getActionColor(entry)}`}>
                {getActionIcon(entry)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{entry.action}</p>
                  {getBadge(entry)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')} by {entry.performed_by}
                </p>
                {entry.details && (
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    "{entry.details}"
                  </p>
                )}
                {entry.type === 'workflow_modification' && entry.reason && !entry.details && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Reason:</span> {entry.reason}
                  </p>
                )}
              </div>
            </div>
          ))}
          {allEntries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No activity recorded yet
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
