import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Settings2, CheckCircle, XCircle, RotateCcw, Forward, FileText, Ban, Bell, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useEntityApprovals } from '@/hooks/useEntityApprovals';

/**
 * EntityActivityLog — entity-parameterized merge of PermitActivityLog and
 * GatePassActivityLog (audit item D1). Renders a chronological, screen-only
 * timeline of entity events.
 *
 * The two entities draw on DIFFERENT data sources, which is the crux of this
 * merge and why the sources are parameterized rather than shared:
 *
 *   PERMIT:    approvals (permit_approvals via useEntityApprovals)
 *            + activity_logs (legacy free-form action log)
 *            + permit_workflow_audit (workflow-modification entries)
 *
 *   GATE PASS: approvals (gate_pass_approvals, terminal rows only)
 *            + signature_audit_logs (mapped audit entries)
 *
 * Both share: a synthetic "<Noun> Created" first entry, terminal-only
 * approval entries (approved/rejected), the case-insensitive dedupe of the
 * secondary source against approval entries, chronological ascending sort,
 * and the icon/color/badge rendering below. The permit path exercises the
 * full icon/color/badge switch (workflow modifications, rework/forward/etc.);
 * the gate-pass path only ever produces creation/approval/audit entries, and
 * this shared logic reproduces its previous output exactly for those.
 */

type EntityType = 'permit' | 'gate_pass';

interface ActivityLogEntry {
  id: string;
  type: 'activity' | 'workflow_modification' | 'approval' | 'creation' | 'audit';
  action: string;
  performed_by: string;
  performed_by_email?: string;
  details?: string | null;
  created_at: string;
  status?: 'approved' | 'rejected' | 'pending';
  modification_type?: string;
  reason?: string | null;
}

interface EntityActivityLogProps {
  entity: EntityType;
  id: string;
  createdAt: string;
  requesterName: string;
}

// Permit role display-name mapping.
const PERMIT_ROLE_LABELS: Record<string, string> = {
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

function permitRoleLabel(roleName: string): string {
  return PERMIT_ROLE_LABELS[roleName] ?? roleName;
}

// Gate-pass role display-name mapping — mirrors defaultRoleLabel in
// GatePassApprovalProgress. Falls back to snake_case -> Title Case.
function gatePassRoleLabel(roleName: string): string {
  const overrides: Record<string, string> = {
    store_manager: 'Store Manager',
    finance: 'Finance',
    security: 'Security',
    security_pmd: 'Security (PMD)',
    cr_coordinator: 'CR Coordinator',
    head_cr: 'Head CR',
    hm_security_pmd: 'HM Security (PMD)',
  };
  if (overrides[roleName]) return overrides[roleName];
  return roleName
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

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

// ---------------------------------------------------------------------------
// Permit source hooks. Reads permit_approvals (via useEntityApprovals),
// activity_logs, and permit_workflow_audit.
// ---------------------------------------------------------------------------
function usePermitEntries(
  id: string,
  createdAt: string,
): { entries: ActivityLogEntry[]; isLoading: boolean } {
  const { data: approvalRows, isLoading: isLoadingApprovals } = useEntityApprovals('permit', id);

  const { data: activityLogs, isLoading: isLoadingActivity } = useQuery({
    queryKey: ['permit-activity-logs', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('permit_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const { data: workflowAuditLogs, isLoading: isLoadingAudit } = useQuery({
    queryKey: ['permit-workflow-audit', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permit_workflow_audit')
        .select('*')
        .eq('permit_id', id)
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
    .filter((row) => row.status === 'approved' || row.status === 'rejected')
    .map((row) => {
      const roleLabel = permitRoleLabel(row.role_name);
      return {
        id: `approval-${row.role_name}`,
        type: 'approval' as const,
        action: row.status === 'approved' ? `${roleLabel} Approved` : `${roleLabel} Rejected`,
        performed_by: row.approver_name ?? 'Unknown',
        details: row.comments,
        // Use approved_at when present; fall back to updated_at for
        // older rows that backfilled without an explicit timestamp.
        created_at: row.approved_at ?? row.updated_at ?? createdAt,
        status: row.status as 'approved' | 'rejected',
      };
    });

  const entries: ActivityLogEntry[] = [
    ...approvalEntries,
    // Activity logs (filter out duplicates with approval entries)
    ...(activityLogs || [])
      .filter((log) => {
        const actionLower = log.action.toLowerCase();
        const isDuplicateApproval = approvalEntries.some(
          (entry) => entry.action.toLowerCase() === actionLower,
        );
        return !isDuplicateApproval;
      })
      .map((log) => ({
        id: log.id,
        type: 'activity' as const,
        action: log.action,
        performed_by: log.performed_by,
        details: log.details,
        created_at: log.created_at,
      })),
    // Workflow audit logs
    ...(workflowAuditLogs || []).map((log) => ({
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
  ];

  return { entries, isLoading };
}

// ---------------------------------------------------------------------------
// Gate-pass source hooks. Reads gate_pass_approvals (terminal rows) and
// signature_audit_logs.
// ---------------------------------------------------------------------------
function useGatePassEntries(
  id: string,
  createdAt: string,
): { entries: ActivityLogEntry[]; isLoading: boolean } {
  const { data: approvalRows, isLoading: isLoadingApprovals } = useQuery({
    queryKey: ['gate-pass-activity-approvals', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('gate_pass_approvals')
        .select('role_name, status, approver_name, approved_at, comments')
        .eq('gate_pass_id', id);
      if (error) throw error;
      return (data ?? []) as {
        role_name: string;
        status: string;
        approver_name: string | null;
        approved_at: string | null;
        comments: string | null;
      }[];
    },
  });

  const { data: auditRows, isLoading: isLoadingAudit } = useQuery({
    queryKey: ['gate-pass-activity-audit', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('signature_audit_logs')
        .select('id, user_name, role, action, created_at, auth_method')
        .eq('gate_pass_id', id)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        user_name: string | null;
        role: string;
        action: string;
        created_at: string | null;
        auth_method: string | null;
      }[];
    },
  });

  const isLoading = isLoadingApprovals || isLoadingAudit;

  // Build approval entries from terminal (approved/rejected) rows.
  const approvalEntries: ActivityLogEntry[] = (approvalRows ?? [])
    .filter((row) => row.status === 'approved' || row.status === 'rejected')
    .map((row) => {
      const label = gatePassRoleLabel(row.role_name);
      return {
        id: `approval-${row.role_name}`,
        type: 'approval' as const,
        action: row.status === 'approved' ? `${label} Approved` : `${label} Rejected`,
        performed_by: row.approver_name ?? 'Unknown',
        details: row.comments,
        created_at: row.approved_at ?? createdAt,
        status: row.status as 'approved' | 'rejected',
      };
    });

  // Build audit entries, DEDUPED against the approval entries the same way
  // the permit path dedupes activity_logs: skip a signature-audit entry
  // whose action string matches an approval entry (case-insensitive).
  const auditEntries: ActivityLogEntry[] = (auditRows ?? [])
    .map((row) => {
      const label = gatePassRoleLabel(row.role);
      const actionLower = (row.action ?? '').toLowerCase();
      const action =
        actionLower === 'approved'
          ? `${label} Approved`
          : actionLower === 'rejected'
          ? `${label} Rejected`
          : `${label} ${row.action}`;
      return {
        id: `audit-${row.id}`,
        type: 'audit' as const,
        action,
        performed_by: row.user_name ?? 'Unknown',
        created_at: row.created_at ?? createdAt,
        status:
          actionLower === 'approved'
            ? ('approved' as const)
            : actionLower === 'rejected'
            ? ('rejected' as const)
            : undefined,
      };
    })
    .filter((entry) => {
      const actionLower = entry.action.toLowerCase();
      const isDuplicateApproval = approvalEntries.some(
        (a) => a.action.toLowerCase() === actionLower,
      );
      return !isDuplicateApproval;
    });

  return { entries: [...approvalEntries, ...auditEntries], isLoading };
}

// ---------------------------------------------------------------------------
// Rendering. The permit path exercises the full switch; the gate-pass path
// only produces creation/approval/audit entries and this reproduces its
// previous output exactly for those.
// ---------------------------------------------------------------------------
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
  if (entry.status === 'rejected') {
    return (
      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] py-0">
        Rejected
      </Badge>
    );
  }
  return null;
}

export function EntityActivityLog({ entity, id, createdAt, requesterName }: EntityActivityLogProps) {
  // NOTE: both branches call the same number/order of hooks unconditionally
  // within their respective source-hook functions; `entity` is fixed for the
  // lifetime of a mounted component, so calling one branch's hook is stable.
  const permit = usePermitEntries(entity === 'permit' ? id : '', createdAt);
  const gatePass = useGatePassEntries(entity === 'gate_pass' ? id : '', createdAt);

  const { entries: sourceEntries, isLoading } =
    entity === 'permit' ? permit : gatePass;
  const createdLabel = entity === 'permit' ? 'Permit Created' : 'Gate Pass Created';

  // Combine and sort all entries chronologically ascending.
  const allEntries: ActivityLogEntry[] = [
    {
      id: 'created',
      type: 'creation' as const,
      action: createdLabel,
      performed_by: requesterName,
      created_at: createdAt,
    },
    ...sourceEntries,
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

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
