import { useState, useEffect } from 'react';
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
import { Loader2, Lock, Shield, Fingerprint, KeyRound } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  const { profile } = useAuth();
  const [password, setPassword] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<'password' | 'biometric'>('password');
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const { isSupported: biometricSupported, isChecking: checkingBiometric, verifyIdentity } = useBiometricAuth();
  const isMobile = useIsMobile();

  // Set default auth method from user preference when dialog opens
  useEffect(() => {
    if (isOpen && profile?.auth_preference) {
      const preference = profile.auth_preference as 'password' | 'biometric';
      // Only use biometric preference if device supports it
      if (preference === 'biometric' && isMobile && biometricSupported) {
        setAuthMethod('biometric');
      } else if (preference === 'password') {
        setAuthMethod('password');
      }
      // If biometric preference but no support, default to password (already set)
    }
  }, [isOpen, profile?.auth_preference, isMobile, biometricSupported]);

  const handleBiometricAuth = async () => {
    setError(null);
    setIsVerifying(true);
    
    try {
      const result = await verifyIdentity();
      if (result.success) {
        setBiometricVerified(true);
        setError(null);
      } else {
        setError(result.error || 'Biometric verification failed');
        setBiometricVerified(false);
      }
    } catch (err: any) {
      setError(err.message || 'Biometric verification failed');
      setBiometricVerified(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleConfirm = async () => {
    // Validate based on auth method
    if (authMethod === 'password') {
      if (!password) {
        setError('Please enter your password');
        return;
      }
    } else if (authMethod === 'biometric') {
      if (!biometricVerified) {
        setError('Please verify your identity using fingerprint/Face ID');
        return;
      }
    }

    if (!signature && actionType === 'approve') {
      setError('Please provide your signature');
      return;
    }

    try {
      setError(null);
      // For biometric auth, pass a special token that the backend recognizes
      const authValue = authMethod === 'biometric' ? '__BIOMETRIC_VERIFIED__' : password;
      await onConfirm(authValue, signature || '');
      // Reset on success
      setPassword('');
      setSignature(null);
      setBiometricVerified(false);
      setAuthMethod('password');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleClose = () => {
    setPassword('');
    setSignature(null);
    setError(null);
    setBiometricVerified(false);
    setAuthMethod('password');
    onClose();
  };

  const showBiometricOption = isMobile && biometricSupported && !checkingBiometric;

  const canSubmit = () => {
    if (actionType === 'approve' && !signature) return false;
    if (authMethod === 'password' && !password) return false;
    if (authMethod === 'biometric' && !biometricVerified) return false;
    return true;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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

          {/* Authentication Method Selection */}
          {showBiometricOption ? (
            <Tabs value={authMethod} onValueChange={(v) => setAuthMethod(v as 'password' | 'biometric')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="password" className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Password
                </TabsTrigger>
                <TabsTrigger value="biometric" className="flex items-center gap-2">
                  <Fingerprint className="h-4 w-4" />
                  Fingerprint
                </TabsTrigger>
              </TabsList>

              <TabsContent value="password" className="space-y-2 mt-4">
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
              </TabsContent>

              <TabsContent value="biometric" className="space-y-4 mt-4">
                <div className="text-center space-y-4">
                  <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
                    biometricVerified 
                      ? 'bg-green-100 dark:bg-green-900/30' 
                      : 'bg-muted'
                  }`}>
                    <Fingerprint className={`h-10 w-10 ${
                      biometricVerified 
                        ? 'text-green-600 dark:text-green-400' 
                        : 'text-muted-foreground'
                    }`} />
                  </div>
                  
                  {biometricVerified ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        ✓ Identity Verified
                      </p>
                      <p className="text-xs text-muted-foreground">
                        You can now proceed with the {actionType === 'approve' ? 'approval' : 'rejection'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Tap below to verify your identity using fingerprint or Face ID
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={handleBiometricAuth}
                        disabled={isVerifying || isLoading}
                        className="w-full"
                      >
                        {isVerifying ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          <>
                            <Fingerprint className="h-5 w-5 mr-2" />
                            Verify with Fingerprint
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            /* Password-only mode for desktop or when biometric not available */
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
          )}

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
              {authMethod === 'biometric' && <li>Biometric verification record</li>}
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !canSubmit()}
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
