import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Fingerprint, KeyRound, ShieldCheck, CheckCircle2, Info } from 'lucide-react';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { useSavedSignature } from '@/hooks/useSavedSignature';

/**
 * AuthPayload — the dialog hands this to the caller on confirm. The
 * caller forwards it verbatim to verify-signature-approval or
 * verify-gate-pass-approval.
 */
export type AuthPayload =
  | { authMethod: 'password'; password: string }
  | { authMethod: 'webauthn'; webauthn: { challengeId: string; assertion: unknown } };

interface SecureApprovalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (auth: AuthPayload, signature: string | null) => Promise<void>;
  title: string;
  description: string;
  actionType: 'approve' | 'reject';
  isLoading: boolean;
  /**
   * Binding for the biometric path — the server issues a challenge bound
   * to these fields so the assertion cannot be replayed on another resource.
   * Exactly one of permitId / gatePassId must be provided.
   */
  authBinding: {
    permitId?: string;
    gatePassId?: string;
    role: string;
  };
}

/**
 * SecureApprovalDialog (Phase 3b redesign)
 *
 * Priorities this rewrite addresses:
 *   1. Bigger signature pad — approvers sign on phones daily.
 *   2. Collapsed "Security Notice" into a small toggle, reclaiming vertical space.
 *   3. Fingerprint tab leads on mobile when the user has a registered credential.
 *   4. Fully translated via react-i18next; every string is a t() call.
 *   5. RTL-safe (logical properties, dir="auto" on free-text fields).
 *   6. Brand-aligned — uses primary (Al Hamra red) and success tokens.
 */
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
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const { data: savedSignature } = useSavedSignature();
  const {
    isSupported: webauthnSupported,
    platformAvailable,
    isChecking: checkingBiometric,
    authenticateForApproval,
  } = useBiometricAuth();

  const [password, setPassword] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<'password' | 'webauthn'>('password');
  const [webauthnPayload, setWebauthnPayload] = useState<
    { challengeId: string; assertion: unknown } | null
  >(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showSecurityNotice, setShowSecurityNotice] = useState(false);

  const showBiometricOption =
    isMobile && webauthnSupported && platformAvailable && !checkingBiometric;

  // Default to biometric on mobile when available + user has opted for it.
  useEffect(() => {
    if (!isOpen) return;
    if (showBiometricOption && profile?.auth_preference === 'biometric') {
      setAuthMethod('webauthn');
    } else {
      setAuthMethod('password');
    }
  }, [isOpen, showBiometricOption, profile?.auth_preference]);

  const resetState = () => {
    setPassword('');
    setSignature(null);
    setError(null);
    setWebauthnPayload(null);
    setIsVerifying(false);
    setShowSecurityNotice(false);
  };

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
      if (result.ok === true) {
        setWebauthnPayload(result.data);
      } else {
        setError(result.error);
        setWebauthnPayload(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
      setWebauthnPayload(null);
    } finally {
      setIsVerifying(false);
    }
  };

  const canSubmit = () => {
    if (actionType === 'approve' && !signature) return false;
    if (authMethod === 'password' && !password) return false;
    if (authMethod === 'webauthn' && !webauthnPayload) return false;
    return true;
  };

  const handleConfirm = async () => {
    if (actionType === 'approve' && !signature) {
      setError(t('permits.approve.signature'));
      return;
    }

    let payload: AuthPayload;
    if (authMethod === 'password') {
      if (!password) {
        setError(t('auth.enterPassword'));
        return;
      }
      payload = { authMethod: 'password', password };
    } else {
      if (!webauthnPayload) {
        setError(t('permits.approve.identityVerifiedHint'));
        return;
      }
      payload = { authMethod: 'webauthn', webauthn: webauthnPayload };
    }

    try {
      setError(null);
      await onConfirm(payload, signature);
      resetState();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.serverError'));
      // WebAuthn assertion is single-use server-side — drop it so user retries.
      setWebauthnPayload(null);
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const submitLabel =
    actionType === 'approve'
      ? t('permits.approve.approveButton')
      : t('permits.approve.rejectButton');

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <span dir="auto">{title}</span>
          </DialogTitle>
          <DialogDescription dir="auto">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription dir="auto">{error}</AlertDescription>
            </Alert>
          )}

          {/* ==== Auth ==== */}
          {showBiometricOption ? (
            <Tabs
              value={authMethod}
              onValueChange={(v) => {
                setAuthMethod(v as 'password' | 'webauthn');
                setError(null);
              }}
            >
              <TabsList className="grid w-full grid-cols-2 h-11">
                <TabsTrigger value="webauthn" className="flex items-center gap-2">
                  <Fingerprint className="h-4 w-4" />
                  {t('permits.approve.fingerprintTab')}
                </TabsTrigger>
                <TabsTrigger value="password" className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  {t('permits.approve.passwordTab')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="webauthn" className="mt-4">
                <BiometricPanel
                  verified={!!webauthnPayload}
                  verifying={isVerifying}
                  loading={isLoading}
                  onVerify={handleBiometricAuth}
                />
              </TabsContent>

              <TabsContent value="password" className="mt-4">
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  disabled={isLoading}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <PasswordField
              value={password}
              onChange={setPassword}
              disabled={isLoading}
            />
          )}

          {/* ==== Signature (approve only) ==== */}
          {actionType === 'approve' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium" dir="auto">
                {t('permits.approve.signature')}
              </Label>
              <SignaturePad
                onSave={(sig) => setSignature(sig)}
                disabled={isLoading}
                initialValue={savedSignature?.signature ?? null}
              />
            </div>
          )}

          {/* ==== Security notice — collapsed by default ==== */}
          <button
            type="button"
            onClick={() => setShowSecurityNotice((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
            aria-expanded={showSecurityNotice}
          >
            <Info className="h-3.5 w-3.5" />
            <span>{t('permits.approve.whatGetsLogged')}</span>
          </button>
          {showSecurityNotice && (
            <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              <p dir="auto">
                {t('permits.approve.auditNotice')}
                {authMethod === 'webauthn'
                  ? ' ' + t('permits.approve.auditNoticeWebauthn')
                  : ''}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 flex-col sm:flex-row">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !canSubmit()}
            variant={actionType === 'reject' ? 'destructive' : 'default'}
            className="w-full sm:w-auto"
          >
            {isLoading && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function PasswordField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Label htmlFor="approval-password" className="text-sm font-medium">
        {t('auth.password')}
      </Label>
      <Input
        id="approval-password"
        type="password"
        placeholder={t('auth.enterPassword')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="current-password"
        className="h-11"
      />
    </div>
  );
}

function BiometricPanel({
  verified,
  verifying,
  loading,
  onVerify,
}: {
  verified: boolean;
  verifying: boolean;
  loading: boolean;
  onVerify: () => void;
}) {
  const { t } = useTranslation();

  if (verified) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-4 flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-success">
            {t('permits.approve.identityVerified')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('permits.approve.identityVerifiedHint')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center space-y-3">
      <Button
        type="button"
        size="lg"
        onClick={onVerify}
        disabled={verifying || loading}
        className="w-full h-14"
      >
        {verifying ? (
          <>
            <Loader2 className="h-5 w-5 me-2 animate-spin" />
            {t('common.loading')}
          </>
        ) : (
          <>
            <Fingerprint className="h-5 w-5 me-2" />
            {t('auth.verifyIdentity')}
          </>
        )}
      </Button>
    </div>
  );
}
