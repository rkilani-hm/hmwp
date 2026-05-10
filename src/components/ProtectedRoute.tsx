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
    const isProfileIncomplete =
      !profile.full_name?.trim() ||
      !profile.phone?.trim() ||
      !profile.company_name?.trim();

    // Redirect to onboarding if profile is incomplete, unless already on onboarding page
    if (isProfileIncomplete && location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />;
    }

    // Pending or rejected accounts get a dedicated holding page until
    // an admin acts on the queue. This runs AFTER the onboarding gate
    // so admins always see a complete profile (full_name, phone,
    // company_name) when they review the pending request.
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
  }

  return <>{children}</>;
}
