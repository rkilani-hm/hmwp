import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, FileText } from 'lucide-react';
import { format } from 'date-fns';

/**
 * GatePassActivityLog — the gate-pass analogue of PermitActivityLog.
 *
 * Builds a chronological, screen-only timeline of gate-pass events from
 * three client-side sources (RLS already permits these reads):
 *   1. a synthetic "Gate Pass Created" entry (requester + created_at);
 *   2. terminal gate_pass_approvals rows (approved / rejected);
 *   3. signature_audit_logs action rows, DEDUPED against the approvals
 *      the same way PermitActivityLog dedupes activity_logs.
 *
 * No PDF / edge-function involvement — this is purely in-screen.
 */

interface ActivityLogEntry {
  id: string;
  type: 'approval' | 'audit' | 'creation';
  action: string;
  performed_by: string;
  details?: string | null;
  created_at: string;
  status?: 'approved' | 'rejected';
}

interface GatePassActivityLogProps {
  gatePassId: string;
  gatePassCreatedAt: string;
  requesterName: string;
}

// GP role display-name mapping — mirrors defaultRoleLabel in
// GatePassApprovalProgress. Falls back to snake_case -> Title Case.
function roleLabel(roleName: string): string {
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

export function GatePassActivityLog({
  gatePassId,
  gatePassCreatedAt,
  requesterName,
}: GatePassActivityLogProps) {
  // Terminal approval rows from gate_pass_approvals.
  const { data: approvalRows, isLoading: isLoadingApprovals } = useQuery({
    queryKey: ['gate-pass-activity-approvals', gatePassId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('gate_pass_approvals')
        .select('role_name, status, approver_name, approved_at, comments')
        .eq('gate_pass_id', gatePassId);
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

  // Signature audit action rows for this gate pass.
  const { data: auditRows, isLoading: isLoadingAudit } = useQuery({
    queryKey: ['gate-pass-activity-audit', gatePassId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('signature_audit_logs')
        .select('id, user_name, role, action, created_at, auth_method')
        .eq('gate_pass_id', gatePassId)
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
      const label = roleLabel(row.role_name);
      return {
        id: `approval-${row.role_name}`,
        type: 'approval' as const,
        action: row.status === 'approved' ? `${label} Approved` : `${label} Rejected`,
        performed_by: row.approver_name ?? 'Unknown',
        details: row.comments,
        created_at: row.approved_at ?? gatePassCreatedAt,
        status: row.status as 'approved' | 'rejected',
      };
    });

  // Build audit entries, DEDUPED against the approval entries the same way
  // PermitActivityLog dedupes activity_logs: skip a signature-audit entry
  // whose action string matches an approval entry (case-insensitive).
  const auditEntries: ActivityLogEntry[] = (auditRows ?? [])
    .map((row) => {
      const label = roleLabel(row.role);
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
        created_at: row.created_at ?? gatePassCreatedAt,
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

  // Combine and sort chronologically ascending.
  const allEntries: ActivityLogEntry[] = [
    {
      id: 'created',
      type: 'creation' as const,
      action: 'Gate Pass Created',
      performed_by: requesterName,
      created_at: gatePassCreatedAt,
    },
    ...approvalEntries,
    ...auditEntries,
  ].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  function getActionIcon(entry: ActivityLogEntry) {
    if (entry.type === 'creation') {
      return <FileText className="w-3 h-3" />;
    }
    if (entry.status === 'rejected') return <XCircle className="w-3 h-3" />;
    const actionLower = entry.action.toLowerCase();
    if (actionLower.includes('rejected')) return <XCircle className="w-3 h-3" />;
    return <CheckCircle className="w-3 h-3" />;
  }

  function getActionColor(entry: ActivityLogEntry): string {
    if (entry.type === 'creation') return 'bg-primary text-primary-foreground';
    const actionLower = entry.action.toLowerCase();
    if (entry.status === 'rejected' || actionLower.includes('rejected')) {
      return 'bg-destructive text-destructive-foreground';
    }
    return 'bg-success text-success-foreground';
  }

  function getBadge(entry: ActivityLogEntry) {
    if (entry.status === 'rejected') {
      return (
        <Badge
          variant="outline"
          className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] py-0"
        >
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
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${getActionColor(
                  entry,
                )}`}
              >
                {getActionIcon(entry)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{entry.action}</p>
                  {getBadge(entry)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')} by{' '}
                  {entry.performed_by}
                </p>
                {entry.details && (
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    "{entry.details}"
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
