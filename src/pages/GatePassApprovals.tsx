import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGatePasses, useApproveGatePass, useCompleteGatePass } from '@/hooks/useGatePasses';
import { useAuth } from '@/contexts/AuthContext';
import { gatePassStatusLabels, gatePassTypeLabels } from '@/types/gatePass';
import type { GatePass, GatePassStatus } from '@/types/gatePass';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Eye } from 'lucide-react';
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
  const { data: passes, isLoading } = useGatePasses();
  const { roles } = useAuth();
  const approveGatePass = useApproveGatePass();
  const completeGatePass = useCompleteGatePass();

  const pendingPasses = useMemo(() => {
    if (!passes) return [];
    return passes.filter(p => {
      // Check if any of the user's roles match the pending status
      for (const role of roles) {
        if (p.status === `pending_${role}`) return true;
      }
      if (roles.includes('security') && p.status === 'approved') return true;
      return false;
    });
  }, [passes, roles]);

  const getApprovalRole = (gp: GatePass): string | null => {
    for (const role of roles) {
      if (gp.status === `pending_${role}`) return role;
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
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/gate-passes/${gp.id}`)}>
                        <Eye className="mr-1 h-4 w-4" /> View
                      </Button>
                      {approvalRole && (
                        <>
                          <Button size="sm" onClick={() => approveGatePass.mutate({ gatePassId: gp.id, role: approvalRole, approved: true })} disabled={approveGatePass.isPending}>
                            <CheckCircle className="mr-1 h-4 w-4" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => approveGatePass.mutate({ gatePassId: gp.id, role: approvalRole, approved: false })} disabled={approveGatePass.isPending}>
                            <XCircle className="mr-1 h-4 w-4" /> Reject
                          </Button>
                        </>
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
