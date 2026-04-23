// =============================================================================
// BiometricDevices — Settings page section
//
// Lets the user register a new platform authenticator (fingerprint / Face ID
// / Windows Hello) and remove existing ones. Drop this into Settings.tsx:
//
//   import { BiometricDevices } from '@/components/BiometricDevices';
//   ...
//   <BiometricDevices />
// =============================================================================

import { useEffect, useState } from 'react';
import { useBiometricAuth, RegisteredCredential } from '@/hooks/useBiometricAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Fingerprint, Loader2, Trash2, ShieldCheck, AlertTriangle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export function BiometricDevices() {
  const { isSupported, platformAvailable, isChecking, registerCredential, listCredentials, deleteCredential } =
    useBiometricAuth();

  const [credentials, setCredentials] = useState<RegisteredCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RegisteredCredential | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const creds = await listCredentials();
      setCredentials(creds);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegister = async () => {
    setRegistering(true);
    try {
      const result = await registerCredential(deviceName.trim() || undefined);
      if (result.success) {
        toast.success('Biometric device registered');
        setRegisterOpen(false);
        setDeviceName('');
        await refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCredential(deleteTarget.id);
      toast.success('Device removed');
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove device');
    } finally {
      setDeleting(false);
    }
  };

  if (isChecking) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5" />
            Biometric Devices
          </CardTitle>
          <CardDescription>
            Sign in and approve permits with fingerprint, Face ID, or Windows Hello.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Not supported on this browser</AlertTitle>
            <AlertDescription>
              This browser does not support WebAuthn. Use a recent Chrome, Safari, Edge, or Firefox
              to register biometric devices.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Fingerprint className="h-5 w-5" />
                Biometric Devices
              </CardTitle>
              <CardDescription>
                Register this device to approve permits with fingerprint, Face ID, or Windows Hello.
                All assertions are bound to the specific permit and action.
              </CardDescription>
            </div>
            <Button
              onClick={() => setRegisterOpen(true)}
              disabled={!platformAvailable}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add this device
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!platformAvailable && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No platform authenticator (fingerprint / Face ID / Windows Hello) detected on
                this device. You can still use password authentication.
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="py-4 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : credentials.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No biometric devices registered yet.
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {credentials.map((cred) => (
                <div
                  key={cred.id}
                  className="flex items-center justify-between gap-4 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ShieldCheck className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="font-medium truncate">
                        {cred.device_name || 'Unnamed device'}
                      </span>
                      {cred.backup_state && (
                        <Badge variant="secondary" className="text-xs">
                          Synced
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-x-2">
                      <span>Added {format(new Date(cred.created_at), 'dd MMM yyyy')}</span>
                      {cred.last_used_at && (
                        <span>
                          · Last used {format(new Date(cred.last_used_at), 'dd MMM yyyy HH:mm')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(cred)}
                    className="text-destructive hover:bg-destructive/10"
                    title="Remove device"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Register dialog */}
      <Dialog open={registerOpen} onOpenChange={(o) => !registering && setRegisterOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5" />
              Register biometric device
            </DialogTitle>
            <DialogDescription>
              Name this device so you can recognize it later. You'll be prompted to verify
              with your biometric sensor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="deviceName">Device name</Label>
            <Input
              id="deviceName"
              placeholder="e.g. My iPhone"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              disabled={registering}
              maxLength={100}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setRegisterOpen(false)}
              disabled={registering}
            >
              Cancel
            </Button>
            <Button onClick={handleRegister} disabled={registering}>
              {registering ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Follow device prompt...
                </>
              ) : (
                <>
                  <Fingerprint className="h-4 w-4 mr-2" />
                  Register
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !deleting && !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove biometric device?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.device_name || 'Unnamed device'}" will no longer be usable to
              approve permits. You can re-register it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
