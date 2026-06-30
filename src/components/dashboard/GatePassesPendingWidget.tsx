import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePendingGatePassesForApprover } from '@/hooks/useGatePasses';
import { gatePassStatusLabels, gatePassTypeLabels } from '@/types/gatePass';
import { PackageCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

interface GatePassesPendingWidgetProps {
  /** When true, render an "All caught up" card instead of hiding when the
   *  queue is empty. Used on the Dashboard's Gate Passes tab so the GP
   *  "Pending with Me" is always present; left false elsewhere (e.g. the
   *  ApproverInbox) so it doesn't clutter when there's nothing. */
  showEmptyState?: boolean;
}

/**
 * Gate Passes pending the current user's action — the GP analogue of
 * PendingWithMeWidget. Resolution is the WP method (get_my_gate_pass_inbox via
 * usePendingGatePassesForApprover, delegation-aware). Rendered on the main
 * Dashboard and the ApproverInbox so GPs surface beside Work Permits.
 */
export function GatePassesPendingWidget({ showEmptyState = false }: GatePassesPendingWidgetProps) {
  const navigate = useNavigate();
  const { data: passes, isLoading } = usePendingGatePassesForApprover();

  const display = passes?.slice(0, 5) ?? [];
  const total = passes?.length ?? 0;
  const hasMore = total > 5;

  if (isLoading) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (total === 0) {
    if (!showEmptyState) return null;
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-4">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-primary" />
            Gate Passes Pending
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <CheckCircle2 className="w-12 h-12 text-success/50 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">All caught up!</p>
            <p className="text-sm text-muted-foreground mt-1">
              No gate passes waiting for your approval
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <PackageCheck className="w-5 h-5 text-primary" />
          Gate Passes Pending
          <span className="ml-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
            {total}
          </span>
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gate-passes/approvals" className="text-primary">
            View all
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {display.map((gp) => (
          <div
            key={gp.id}
            className="flex items-center justify-between p-3 bg-card rounded-lg border cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate(`/gate-passes/${gp.id}`)}
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{gp.pass_no}</p>
              <p className="text-xs text-muted-foreground truncate">
                {gatePassTypeLabels[gp.pass_type] || gp.pass_type} • {gp.requester_name}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Submitted {formatDistanceToNow(new Date(gp.created_at), { addSuffix: true })}
              </p>
            </div>
            <div className="ml-3 shrink-0">
              <Badge variant="outline">{gatePassStatusLabels[gp.status] || gp.status}</Badge>
            </div>
          </div>
        ))}

        {hasMore && (
          <Button variant="outline" size="sm" className="w-full mt-2" asChild>
            <Link to="/gate-passes/approvals">
              View all {total} pending gate passes
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
