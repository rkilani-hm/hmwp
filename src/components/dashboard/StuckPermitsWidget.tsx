import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResendNotification } from '@/hooks/useResendNotification';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, Eye, Clock, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface StuckPermit {
  id: string;
  permit_no: string;
  status: string;
  contractor_name: string;
  updated_at: string;
  sla_breached: boolean | null;
  sla_deadline: string | null;
}

export function StuckPermitsWidget() {
  const navigate = useNavigate();
  const resendNotification = useResendNotification();
  const [resendingId, setResendingId] = useState<string | null>(null);

  const { data: stuckPermits, isLoading } = useQuery({
    queryKey: ['stuck-permits-widget'],
    queryFn: async () => {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const { data, error } = await supabase
        .from('work_permits')
        .select('id, permit_no, status, contractor_name, updated_at, sla_breached, sla_deadline')
        .or('status.like.pending_%,status.eq.submitted,status.eq.under_review')
        .lt('updated_at', twentyFourHoursAgo.toISOString())
        .order('updated_at', { ascending: true })
        .limit(5);

      if (error) throw error;
      return data as StuckPermit[];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const handleResend = async (permitId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setResendingId(permitId);
    try {
      await resendNotification.mutateAsync(permitId);
    } finally {
      setResendingId(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-4">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Stuck Permits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stuckPermits || stuckPermits.length === 0) {
    return null; // Don't show widget if no stuck permits
  }

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-4">
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          Stuck Permits
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            &gt;24h pending
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stuckPermits.map((permit) => (
          <div
            key={permit.id}
            className="p-3 bg-card rounded-lg border border-destructive/20 hover:border-destructive/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{permit.permit_no}</p>
                  {permit.sla_breached && (
                    <span className="text-xs bg-destructive/20 text-destructive px-1.5 py-0.5 rounded font-medium">
                      SLA Breached
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {permit.contractor_name}
                </p>
              </div>
              <StatusBadge status={permit.status as any} />
            </div>
            
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>
                  Stuck for {formatDistanceToNow(new Date(permit.updated_at))}
                </span>
              </div>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => navigate(`/permits/${permit.id}`)}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs border-destructive/30 hover:bg-destructive/10"
                  onClick={(e) => handleResend(permit.id, e)}
                  disabled={resendingId === permit.id}
                >
                  {resendingId === permit.id ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Bell className="w-3 h-3 mr-1" />
                  )}
                  Resend
                </Button>
              </div>
            </div>
          </div>
        ))}
        
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => navigate('/permits?stuck=true')}
        >
          View all stuck permits
        </Button>
      </CardContent>
    </Card>
  );
}
