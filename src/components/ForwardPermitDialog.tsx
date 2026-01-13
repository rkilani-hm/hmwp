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
import { useForwardPermit } from '@/hooks/useWorkPermits';
import { Forward, Loader2 } from 'lucide-react';

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
  const [targetRole, setTargetRole] = useState<string>('');
  const [reason, setReason] = useState('');
  const forwardPermit = useForwardPermit();

  // Get current role from status to exclude from options
  const getCurrentRoleFromStatus = (status: string): string => {
    if (status === 'submitted') return 'helpdesk';
    if (status.startsWith('pending_')) {
      return status.replace('pending_', '');
    }
    return '';
  };

  const currentRole = getCurrentRoleFromStatus(currentStatus);

  const handleSubmit = () => {
    if (!targetRole || !reason.trim()) return;

    forwardPermit.mutate(
      { permitId, targetRole: targetRole as AppRole, reason: reason.trim() },
      {
        onSuccess: () => {
          onOpenChange(false);
          setTargetRole('');
          setReason('');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="w-5 h-5" />
            Forward Permit
          </DialogTitle>
          <DialogDescription>
            Forward this permit to another approver for their review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Forward To</Label>
            <Select value={targetRole} onValueChange={setTargetRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select approver role" />
              </SelectTrigger>
              <SelectContent>
                {approverRoles
                  .filter(role => role !== currentRole)
                  .map(role => (
                    <SelectItem key={role} value={role}>
                      {roleLabels[role]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reason for Forwarding</Label>
            <Textarea
              placeholder="Explain why you're forwarding this permit..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!targetRole || !reason.trim() || forwardPermit.isPending}
          >
            {forwardPermit.isPending ? (
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
