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
  }

  return <>{children}</>;
}
