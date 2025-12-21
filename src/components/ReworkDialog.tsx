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
import { useRequestRework } from '@/hooks/useWorkPermits';
import { RotateCcw, Loader2 } from 'lucide-react';

interface ReworkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permitId: string;
}

export function ReworkDialog({
  open,
  onOpenChange,
  permitId,
}: ReworkDialogProps) {
  const [reason, setReason] = useState('');
  const requestRework = useRequestRework();

  const handleSubmit = () => {
    if (!reason.trim()) return;

    requestRework.mutate(
      { permitId, reason: reason.trim() },
      {
        onSuccess: () => {
          onOpenChange(false);
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
            <RotateCcw className="w-5 h-5" />
            Request Rework
          </DialogTitle>
          <DialogDescription>
            Send this permit back to the requester for modifications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>What needs to be changed?</Label>
            <Textarea
              placeholder="Describe what information is missing or needs to be corrected..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              The requester will receive a notification with your feedback.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason.trim() || requestRework.isPending}
            variant="secondary"
          >
            {requestRework.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4 mr-2" />
                Request Rework
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
