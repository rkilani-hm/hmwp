import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { Loader2, Lock, Shield } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SecureApprovalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (password: string, signature: string) => Promise<void>;
  title: string;
  description: string;
  actionType: 'approve' | 'reject';
  isLoading: boolean;
}

export function SecureApprovalDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  actionType,
  isLoading,
}: SecureApprovalDialogProps) {
  const [password, setPassword] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!password) {
      setError('Please enter your password');
      return;
    }
    if (!signature && actionType === 'approve') {
      setError('Please provide your signature');
      return;
    }

    try {
      setError(null);
      await onConfirm(password, signature || '');
      // Reset on success
      setPassword('');
      setSignature(null);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleClose = () => {
    setPassword('');
    setSignature(null);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="password" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Confirm Your Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Your password is required to verify your identity for this action.
            </p>
          </div>

          {actionType === 'approve' && (
            <div className="space-y-2">
              <Label>Your Signature</Label>
              <SignaturePad
                onSave={(sig) => setSignature(sig)}
                disabled={isLoading}
              />
            </div>
          )}

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Security Notice</p>
            <p>This action will be logged with:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li>Your IP address</li>
              <li>Device information</li>
              <li>Timestamp</li>
              <li>Digital signature hash</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !password || (actionType === 'approve' && !signature)}
            className={actionType === 'reject' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {actionType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
