import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PermitVersionComparison } from '@/components/PermitVersionComparison';

interface PermitComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leftPermitId: string;
  rightPermitId: string;
  leftLabel?: string;
  rightLabel?: string;
}

export function PermitComparisonDialog({
  open,
  onOpenChange,
  leftPermitId,
  rightPermitId,
  leftLabel,
  rightLabel,
}: PermitComparisonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-display">Compare Permit Versions</DialogTitle>
          <DialogDescription>
            Side-by-side comparison showing changes between{' '}
            {leftLabel || 'previous'} and {rightLabel || 'current'} versions
          </DialogDescription>
        </DialogHeader>
        <PermitVersionComparison 
          leftPermitId={leftPermitId}
          rightPermitId={rightPermitId}
        />
      </DialogContent>
    </Dialog>
  );
}
