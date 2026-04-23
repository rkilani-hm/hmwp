import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

/**
 * AuthPayload — what the dialog hands back to the caller on confirm.
 * The caller must forward this verbatim to verify-signature-approval.
 */
export type AuthPayload =
  | { authMethod: 'password'; password: string }
  | {
      authMethod: 'webauthn';
      webauthn: { challengeId: string; assertion: unknown };
    };

interface SecureApprovalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (auth: AuthPayload, signature: string | null) => Promise<void>;
  title: string;
  description: string;
  actionType: 'approve' | 'reject';
  isLoading: boolean;
  /**
   * Binding used when the user chooses the biometric path. The server will
   * bind the issued challenge to these fields so the resulting assertion
   * cannot be replayed on a different resource or action.
   *
   * Exactly one of permitId / gatePassId should be provided.
   */
  authBinding: {
    permitId?: string;
    gatePassId?: string;
    role: string;
  };
}

export function SecureApprovalDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  actionType,
  isLoading,
  authBinding,
}: SecureApprovalDialogProps) {
  const { profile } = useAuth();
  const [password, setPassword] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<'password' | 'webauthn'>('password');

  // Produced when user successfully completes WebAuthn; reset on dialog close.
  const [webauthnPayload, setWebauthnPayload] = useState<
    { challengeId: string; assertion: unknown } | null
  >(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const {
    isSupported: webauthnSupported,
    platformAvailable,
    isChecking: checkingBiometric,
    authenticateForApproval,
  } = useBiometricAuth();
  const isMobile = useIsMobile();

  // Default auth method from user preference when dialog opens
  useEffect(() => {
    if (isOpen && profile?.auth_preference) {
      const preference = profile.auth_preference as 'password' | 'biometric';
      if (
        preference === 'biometric' &&
        isMobile &&
        webauthnSupported &&
        platformAvailable
      ) {
        setAuthMethod('webauthn');
      } else if (preference === 'password') {
        setAuthMethod('password');
      }
    }
  }, [isOpen, profile?.auth_preference, isMobile, webauthnSupported, platformAvailable]);

  const handleBiometricAuth = async () => {
    setError(null);
    setIsVerifying(true);

    try {
      const result = await authenticateForApproval({
        permitId: authBinding.permitId,
        gatePassId: authBinding.gatePassId,
        role: authBinding.role,
        action: actionType,
      });
      if (result.ok) {
        setWebauthnPayload(result.data);
        setError(null);
      } else {
        setError(result.error);
        setWebauthnPayload(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Biometric verification failed');
      setWebauthnPayload(null);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleConfirm = async () => {
    // Validate signature for approval
    if (!signature && actionType === 'approve') {
      setError('Please provide your signature');
      return;
    }

    let payload: AuthPayload;
    if (authMethod === 'password') {
      if (!password) {
        setError('Please enter your password');
        return;
      }
      payload = { authMethod: 'password', password };
    } else {
      if (!webauthnPayload) {
        setError('Please verify your identity using fingerprint/Face ID');
        return;
      }
      payload = { authMethod: 'webauthn', webauthn: webauthnPayload };
    }

    try {
      setError(null);
      await onConfirm(payload, signature);
      // Reset on success
      setPassword('');
      setSignature(null);
      setWebauthnPayload(null);
      setAuthMethod('password');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      // WebAuthn assertion is single-use on the server. If we hit an error at
      // approval submission, invalidate it so the user can retry.
      setWebauthnPayload(null);
    }
  };

  const handleClose = () => {
    setPassword('');
    setSignature(null);
    setError(null);
    setWebauthnPayload(null);
    setAuthMethod('password');
    onClose();
  };

  const showBiometricOption =
    isMobile && webauthnSupported && platformAvailable && !checkingBiometric;

  const canSubmit = () => {
    if (actionType === 'approve' && !signature) return false;
    if (authMethod === 'password' && !password) return false;
    if (authMethod === 'webauthn' && !webauthnPayload) return false;
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

          {showBiometricOption ? (
            <Tabs
              value={authMethod}
              onValueChange={(v) => {
                setAuthMethod(v as 'password' | 'webauthn');
                setError(null);
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="password" className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Password
                </TabsTrigger>
                <TabsTrigger value="webauthn" className="flex items-center gap-2">
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
                  autoComplete="current-password"
                />
                <p className="text-xs text-muted-foreground">
                  Your password is required to verify your identity for this action.
                </p>
              </TabsContent>

              <TabsContent value="webauthn" className="space-y-4 mt-4">
                <div className="text-center space-y-4">
                  <div
                    className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
                      webauthnPayload
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : 'bg-muted'
                    }`}
                  >
                    <Fingerprint
                      className={`h-10 w-10 ${
                        webauthnPayload
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-muted-foreground'
                      }`}
                    />
                  </div>

                  {webauthnPayload ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        ✓ Identity Verified
                      </p>
                      <p className="text-xs text-muted-foreground">
                        You can now proceed with the{' '}
                        {actionType === 'approve' ? 'approval' : 'rejection'}
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
                      <p className="text-xs text-muted-foreground">
                        This assertion is cryptographically bound to this specific{' '}
                        {actionType}. It cannot be reused for any other action.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
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
                autoComplete="current-password"
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
              {authMethod === 'webauthn' && (
                <li>WebAuthn credential ID + assertion verification</li>
              )}
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
            className={
              actionType === 'reject'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : ''
            }
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {actionType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
