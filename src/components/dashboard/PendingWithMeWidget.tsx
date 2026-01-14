import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePendingPermitsForApprover } from '@/hooks/useWorkPermits';
import { useAuth } from '@/contexts/AuthContext';
import { Inbox, ArrowRight, CheckCircle, AlertTriangle, Fingerprint, KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function PendingWithMeWidget() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: permits, isLoading } = usePendingPermitsForApprover();
  const authPreference = profile?.auth_preference || 'password';

  // Get the first 5 pending permits for display
  const displayPermits = permits?.slice(0, 5) || [];
  const totalPending = permits?.length || 0;
  const hasMore = totalPending > 5;

  // Check for SLA at-risk permits
  const atRiskCount = permits?.filter(p => {
    if (!p.sla_deadline) return false;
    const deadline = new Date(p.sla_deadline);
    const now = new Date();
    const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilDeadline <= 4 && hoursUntilDeadline > 0;
  }).length || 0;

  const breachedCount = permits?.filter(p => p.sla_breached).length || 0;

  if (isLoading) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" />
            Pending with Me
            {totalPending > 0 && (
              <span className="ml-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                {totalPending}
              </span>
            )}
          </CardTitle>
          {/* Auth Preference Badge */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link 
                  to="/settings" 
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-muted-foreground/20 bg-background hover:bg-muted/50 transition-colors"
                >
                  {authPreference === 'biometric' ? (
                    <Fingerprint className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium">
                    {authPreference === 'biometric' ? 'Bio' : 'Pass'}
                  </span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Auth: {authPreference === 'biometric' ? 'Fingerprint / Face ID' : 'Password'}</p>
                <p className="text-xs text-muted-foreground">Click to change</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {totalPending > 0 && (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/approver-inbox" className="text-primary">
              View all
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* SLA Warning Banner */}
        {(atRiskCount > 0 || breachedCount > 0) && (
          <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/30 rounded-lg text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <span className="text-destructive">
              {breachedCount > 0 && `${breachedCount} SLA breached`}
              {breachedCount > 0 && atRiskCount > 0 && ' • '}
              {atRiskCount > 0 && `${atRiskCount} at risk`}
            </span>
          </div>
        )}

        {displayPermits.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-success/50 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">All caught up!</p>
            <p className="text-sm text-muted-foreground mt-1">No permits waiting for your approval</p>
          </div>
        ) : (
          <>
            {displayPermits.map((permit) => {
              const isBreached = permit.sla_breached;
              const isAtRisk = permit.sla_deadline && !isBreached && (() => {
                const deadline = new Date(permit.sla_deadline);
                const now = new Date();
                const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
                return hoursUntilDeadline <= 4 && hoursUntilDeadline > 0;
              })();

              return (
                <div
                  key={permit.id}
                  className={`flex items-center justify-between p-3 bg-card rounded-lg border cursor-pointer hover:border-primary/30 transition-colors ${
                    isBreached ? 'border-destructive/50 bg-destructive/5' : 
                    isAtRisk ? 'border-warning/50 bg-warning/5' : ''
                  }`}
                  onClick={() => navigate(`/permits/${permit.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{permit.permit_no}</p>
                      {isBreached && (
                        <span className="text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded font-medium">
                          SLA Breached
                        </span>
                      )}
                      {isAtRisk && !isBreached && (
                        <span className="text-xs bg-warning text-warning-foreground px-1.5 py-0.5 rounded font-medium">
                          At Risk
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {permit.contractor_name} • {permit.work_location}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Submitted {formatDistanceToNow(new Date(permit.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="ml-3 shrink-0">
                    <StatusBadge status={permit.status as any} />
                  </div>
                </div>
              );
            })}

            {hasMore && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full mt-2"
                asChild
              >
                <Link to="/approver-inbox">
                  View all {totalPending} pending permits
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
