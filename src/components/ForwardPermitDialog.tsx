import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useForwardPermit, useForwardPermitToUser } from '@/hooks/useWorkPermits';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Forward, Loader2, Users, User } from 'lucide-react';

type AppRole = string;

const roleLabels: Record<string, string> = {
  helpdesk: 'Helpdesk',
  pm: 'Property Management',
  pd: 'Project Development',
  bdcr: 'BDCR',
  mpr: 'MPR',
  it: 'IT Department',
  fitout: 'Fit-Out',
  ecovert_supervisor: 'Ecovert Supervisor',
  pmd_coordinator: 'PMD Coordinator',
  customer_service: 'Customer Service',
  cr_coordinator: 'CR Coordinator',
  head_cr: 'Head of CR',
  soft_facilities: 'Soft Facilities',
  hard_facilities: 'Hard Facilities',
  pm_service: 'PM Service',
  fmsp_approval: 'FMSP Approval',
};

const approverRoles = [
  'customer_service',
  'cr_coordinator',
  'head_cr',
  'helpdesk',
  'pm',
  'pd',
  'bdcr',
  'mpr',
  'it',
  'fitout',
  'ecovert_supervisor',
  'pmd_coordinator',
  'soft_facilities',
  'hard_facilities',
  'pm_service',
  'fmsp_approval',
] as const;

interface ForwardPermitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permitId: string;
  currentStatus: string;
}

export function ForwardPermitDialog({
  open,
  onOpenChange,
  permitId,
  currentStatus,
}: ForwardPermitDialogProps) {
  const [mode, setMode] = useState<'role' | 'user'>('role');
  const [targetRole, setTargetRole] = useState<string>('');
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [reason, setReason] = useState('');
  const forwardPermit = useForwardPermit();
  const forwardPermitToUser = useForwardPermitToUser();

  // Candidate users for person-forward: non-tenant internal staff via the
  // SECURITY DEFINER RPC (a direct profiles query is RLS-blocked for non-admins).
  const { data: candidates = [] } = useQuery({
    queryKey: ['forward-candidates'],
    enabled: open && mode === 'user',
    queryFn: async (): Promise<Array<{ id: string; full_name: string | null; email: string }>> => {
      const { data, error } = await supabase.rpc('list_delegatable_employees' as any);
      if (error) throw error;
      return (data || []) as Array<{ id: string; full_name: string | null; email: string }>;
    },
  });

  // Get current role from status to exclude from role options
  const getCurrentRoleFromStatus = (status: string): string => {
    if (status === 'submitted') return 'helpdesk';
    if (status.startsWith('pending_')) return status.replace('pending_', '');
    return '';
  };
  const currentRole = getCurrentRoleFromStatus(currentStatus);

  const isPending = forwardPermit.isPending || forwardPermitToUser.isPending;

  const reset = () => {
    setTargetRole('');
    setTargetUserId('');
    setReason('');
  };

  const handleSubmit = () => {
    if (!reason.trim()) return;
    if (mode === 'role') {
      if (!targetRole) return;
      forwardPermit.mutate(
        { permitId, targetRole: targetRole as AppRole, reason: reason.trim() },
        { onSuccess: () => { onOpenChange(false); reset(); } },
      );
    } else {
      if (!targetUserId) return;
      forwardPermitToUser.mutate(
        { permitId, userId: targetUserId, reason: reason.trim() },
        { onSuccess: () => { onOpenChange(false); reset(); } },
      );
    }
  };

  const submitDisabled =
    isPending || !reason.trim() ||
    (mode === 'role' ? !targetRole : !targetUserId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="w-5 h-5" />
            Forward Permit
          </DialogTitle>
          <DialogDescription>
            Forward this permit's current step to another approver — a role, or a
            specific person.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'role' | 'user')} className="py-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="role" className="gap-1.5">
              <Users className="w-4 h-4" /> To a role
            </TabsTrigger>
            <TabsTrigger value="user" className="gap-1.5">
              <User className="w-4 h-4" /> To a person
            </TabsTrigger>
          </TabsList>

          <TabsContent value="role" className="space-y-2 pt-3">
            <Label>Forward to role</Label>
            <Select value={targetRole} onValueChange={setTargetRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select approver role" />
              </SelectTrigger>
              <SelectContent>
                {approverRoles
                  .filter((role) => role !== currentRole)
                  .map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabels[role] || role}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </TabsContent>

          <TabsContent value="user" className="space-y-2 pt-3">
            <Label>Forward to person</Label>
            <Select value={targetUserId} onValueChange={setTargetUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a staff member" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name || c.email}
                    {c.full_name && <span className="text-muted-foreground"> · {c.email}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The person you choose can approve or reject THIS step on your behalf —
              it moves to their inbox until they act. No admin role grant needed.
            </p>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label>Reason for Forwarding</Label>
          <Textarea
            placeholder="Explain why you're forwarding this permit..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitDisabled}>
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Forwarding...
              </>
            ) : (
              <>
                <Forward className="w-4 h-4 mr-2" />
                Forward
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
