import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useCancelPermit } from '@/hooks/useWorkPermits';
import { Loader2 } from 'lucide-react';

interface CancelPermitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permitId: string;
  permitNo: string;
}

export function CancelPermitDialog({
  open,
  onOpenChange,
  permitId,
  permitNo,
}: CancelPermitDialogProps) {
  const [reason, setReason] = useState('');
  const cancelPermit = useCancelPermit();

  const handleCancel = async () => {
    await cancelPermit.mutateAsync({
      permitId,
      reason,
    });
    setReason('');
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Withdraw permit {permitNo}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will withdraw your permit request. Any approvals already
            given will be marked withdrawn and the permit will be closed.
            This action cannot be undone — if you want to proceed later,
            you'll need to submit a new permit.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-4">
          <Label htmlFor="cancel-reason">Reason for withdrawal (optional)</Label>
          <Textarea
            id="cancel-reason"
            placeholder="e.g. project postponed, scope changed, duplicate request..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelPermit.isPending}>
            Keep permit active
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancel}
            disabled={cancelPermit.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelPermit.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Withdrawing...
              </>
            ) : (
              'Withdraw permit'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
