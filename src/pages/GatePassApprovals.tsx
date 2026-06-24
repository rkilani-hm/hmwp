import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGatePasses, usePendingGatePassesForApprover, useCompleteGatePass } from '@/hooks/useGatePasses';
import { useAuth } from '@/contexts/AuthContext';
import { gatePassStatusLabels, gatePassTypeLabels } from '@/types/gatePass';
import type { GatePass, GatePassStatus } from '@/types/gatePass';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Eye } from 'lucide-react';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_store_manager: 'bg-warning/10 text-warning',
  pending_finance: 'bg-info/10 text-info',
  pending_security: 'bg-accent/10 text-accent',
  pending_security_pmd: 'bg-accent/10 text-accent',
  pending_cr_coordinator: 'bg-warning/10 text-warning',
  pending_head_cr: 'bg-info/10 text-info',
  pending_hm_security_pmd: 'bg-accent/10 text-accent',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  completed: 'bg-primary/10 text-primary',
};

export default function GatePassApprovals() {
  const navigate = useNavigate();
  // Pending-for-me is resolved server-side (WP method): get_my_gate_pass_inbox →
  // gate_pass_active_approvers, role-based on effective roles (delegation-aware).
  const { data: pendingForMe = [], isLoading } = usePendingGatePassesForApprover();
  // Still need the full list for the GP-specific "complete" step on approved passes.
  const { data: allPasses } = useGatePasses();
  const { roles } = useAuth();
  const completeGatePass = useCompleteGatePass();

  const pendingPasses = useMemo(() => {
    const canComplete =
      roles.includes('security') || roles.includes('hm_security_pmd') || roles.includes('admin');
    const completable = canComplete && allPasses ? allPasses.filter(p => p.status === 'approved') : [];
    // Combine pending-my-action + approved-I-can-complete; de-dupe by id.
    const byId = new Map<string, GatePass>();
    for (const p of [...pendingForMe, ...completable]) byId.set(p.id, p);
    return Array.from(byId.values());
  }, [pendingForMe, allPasses, roles]);

  const getApprovalRole = (gp: GatePass): string | null => {
    for (const role of roles) {
      if (gp.status === `pending_${role}`) return role;
    }
    // Fallback: derive the step's role from the status so a delegated approver
    // (who doesn't directly hold the role) still acts as the correct step role.
    if (typeof gp.status === 'string' && gp.status.startsWith('pending_')) {
      return gp.status.replace('pending_', '');
    }
    return null;
  };

  if (isLoading) return <p className="text-muted-foreground p-8">Loading...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gate Pass Approvals</h1>
        <p className="text-muted-foreground">{pendingPasses.length} pass(es) pending your action</p>
      </div>

      {pendingPasses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No gate passes pending your approval.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pendingPasses.map(gp => {
            const approvalRole = getApprovalRole(gp);
            const canComplete = (roles.includes('security') || roles.includes('hm_security_pmd') || roles.includes('admin')) && gp.status === 'approved';

            return (
              <Card key={gp.id}>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{gp.pass_no}</span>
                        <Badge className={statusColors[gp.status] || 'bg-muted text-muted-foreground'}>
                          {gatePassStatusLabels[gp.status] || gp.status}
                        </Badge>
                        {gp.has_high_value_asset && <Badge variant="destructive">High Value</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {gatePassTypeLabels[gp.pass_type]} • {gp.requester_name} • {format(new Date(gp.created_at), 'dd MMM yyyy')}
                      </p>
                      {gp.client_contractor_name && <p className="text-sm text-muted-foreground">Client: {gp.client_contractor_name}</p>}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {approvalRole ? (
                        <Button size="sm" onClick={() => navigate(`/gate-passes/${gp.id}`)}>
                          <Eye className="mr-1 h-4 w-4" /> Review &amp; approve
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/gate-passes/${gp.id}`)}>
                          <Eye className="mr-1 h-4 w-4" /> View
                        </Button>
                      )}
                      {canComplete && (
                        <Button size="sm" onClick={() => completeGatePass.mutate(gp.id)} disabled={completeGatePass.isPending}>
                          <CheckCircle className="mr-1 h-4 w-4" /> Complete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
