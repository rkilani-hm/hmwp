import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
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
import { Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useInactivityLogout } from '@/hooks/useInactivityLogout';

/**
 * Idle-session guard. Mounts a hidden dialog that appears one minute
 * before the user's session times out, giving them a chance to stay
 * signed in. If they don't act (or close the dialog without choosing),
 * the session ends after a total of 15 minutes of inactivity and they
 * are redirected to /auth with a toast.
 *
 * Place this once inside the AuthProvider + Router subtree
 * (App.tsx). It renders no visible content while the user is active.
 */
const TIMEOUT_MS = 15 * 60 * 1000;   // 15 minutes — hard ceiling
const WARNING_MS = 14 * 60 * 1000;   // 14 minutes — show dialog at this point

export function InactivityGuard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [warningOpen, setWarningOpen] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const handleTimeout = useCallback(async () => {
    setWarningOpen(false);
    try {
      await signOut();
    } catch {
      // Even if signOut errors, we still want to redirect.
    }
    toast.error('You have been signed out due to inactivity.');
    navigate('/auth');
  }, [signOut, navigate]);

  const handleWarning = useCallback(() => {
    // Only show the warning if we're still signed in (defensive — the
    // hook is guarded by `enabled` already, but timers can race).
    if (!user) return;
    setCountdown(Math.round((TIMEOUT_MS - WARNING_MS) / 1000));
    setWarningOpen(true);
  }, [user]);

  const { resetTimer } = useInactivityLogout({
    enabled: !!user,
    timeoutMs: TIMEOUT_MS,
    warningMs: WARNING_MS,
    onWarning: handleWarning,
    onTimeout: handleTimeout,
  });

  // Tick the countdown while the warning is shown. The actual signout
  // is driven by the hook's internal timer; this is purely cosmetic.
  useEffect(() => {
    if (!warningOpen) return;
    const id = window.setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [warningOpen]);

  const handleStaySignedIn = () => {
    setWarningOpen(false);
    resetTimer();
  };

  const handleSignOutNow = async () => {
    setWarningOpen(false);
    await handleTimeout();
  };

  // Don't render the dialog markup at all when no user is signed in —
  // keeps the AlertDialog portal from cluttering anonymous pages.
  if (!user) return null;

  return (
    <AlertDialog
      open={warningOpen}
      onOpenChange={(open) => {
        // The user can't dismiss this by clicking outside — that
        // would defeat the purpose. They must pick one of the two
        // actions, or wait for the countdown to expire.
        if (!open) return;
        setWarningOpen(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-warning" />
            Session expiring soon
          </AlertDialogTitle>
          <AlertDialogDescription>
            You've been inactive for a while. For security, you'll be
            signed out in{' '}
            <span className="font-medium text-foreground">
              {countdown} second{countdown === 1 ? '' : 's'}
            </span>{' '}
            unless you choose to stay signed in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleSignOutNow}>
            Sign out now
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleStaySignedIn}>
            Stay signed in
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
