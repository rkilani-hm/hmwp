import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Only check profile completeness when profile exists
  // If profile is null, it's still being created - don't redirect yet
  if (profile) {
    // Pending or rejected accounts get the holding page FIRST, before
    // any onboarding gate. Reason: when a tenant signs up via the form,
    // the handle_new_user() DB trigger populates full_name + phone +
    // company_name from signup metadata, so they should NOT be sent
    // back through onboarding asking for details they already provided.
    // If for any reason a field IS missing on a pending profile (legacy
    // user, partial signup, admin-created shell), they can complete it
    // after activation — when their status flips to 'approved', the
    // profile-completeness check below will route them to /onboarding
    // for whatever's missing.
    const needsApprovalGate =
      profile.account_status === 'pending' || profile.account_status === 'rejected';

    if (needsApprovalGate && location.pathname !== '/pending-approval') {
      return <Navigate to="/pending-approval" replace />;
    }

    // Approved users who somehow land on /pending-approval bounce to home.
    if (
      profile.account_status === 'approved' &&
      location.pathname === '/pending-approval'
    ) {
      return <Navigate to="/" replace />;
    }

    // Profile completeness gate. Only applies to APPROVED accounts —
    // pending/rejected already redirected above. If any required field
    // is empty, send to /onboarding to fill in just the missing pieces.
    const isProfileIncomplete =
      !profile.full_name?.trim() ||
      !profile.phone?.trim() ||
      !profile.company_name?.trim();

    if (
      profile.account_status === 'approved' &&
      isProfileIncomplete &&
      location.pathname !== '/onboarding'
    ) {
      return <Navigate to="/onboarding" replace />;
    }
  }

  return <>{children}</>;
}
