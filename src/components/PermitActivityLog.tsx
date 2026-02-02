import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Settings2, CheckCircle, XCircle, RotateCcw, Forward, FileText, Ban, Bell } from 'lucide-react';
import { format } from 'date-fns';

interface ActivityLogEntry {
  id: string;
  type: 'activity' | 'workflow_modification';
  action: string;
  performed_by: string;
  performed_by_email?: string;
  details?: string | null;
  created_at: string;
  // Workflow modification specific
  modification_type?: string;
  reason?: string | null;
}

interface PermitActivityLogProps {
  permitId: string;
  permitCreatedAt: string;
  requesterName: string;
}

export function PermitActivityLog({ permitId, permitCreatedAt, requesterName }: PermitActivityLogProps) {
  // Fetch activity logs
  const { data: activityLogs, isLoading: isLoadingActivity } = useQuery({
    queryKey: ['permit-activity-logs', permitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('permit_id', permitId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  // Fetch workflow audit logs
  const { data: workflowAuditLogs, isLoading: isLoadingAudit } = useQuery({
    queryKey: ['permit-workflow-audit', permitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permit_workflow_audit')
        .select('*')
        .eq('permit_id', permitId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const isLoading = isLoadingActivity || isLoadingAudit;

  // Combine and sort all entries chronologically
  const allEntries: ActivityLogEntry[] = [
    // Always include permit creation as first entry
    {
      id: 'created',
      type: 'activity' as const,
      action: 'Permit Created',
      performed_by: requesterName,
      created_at: permitCreatedAt,
    },
    // Activity logs
    ...(activityLogs || []).map(log => ({
      id: log.id,
      type: 'activity' as const,
      action: log.action,
      performed_by: log.performed_by,
      details: log.details,
      created_at: log.created_at,
    })),
    // Workflow audit logs
    ...(workflowAuditLogs || []).map(log => ({
      id: log.id,
      type: 'workflow_modification' as const,
      action: getWorkflowModificationTitle(log.modification_type),
      performed_by: log.modified_by_name,
      performed_by_email: log.modified_by_email,
      details: log.reason,
      created_at: log.created_at || '',
      modification_type: log.modification_type,
      reason: log.reason,
    })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  function getWorkflowModificationTitle(type: string): string {
    switch (type) {
      case 'work_type_change':
        return 'Work Type Changed';
      case 'step_toggle':
        return 'Workflow Step Modified';
      case 'custom_workflow':
        return 'Custom Workflow Applied';
      default:
        return 'Workflow Modified';
    }
  }

  function getActionIcon(action: string, type: string) {
    if (type === 'workflow_modification') {
      return <Settings2 className="w-3 h-3" />;
    }

    const actionLower = action.toLowerCase();
    if (actionLower.includes('approved') || actionLower.includes('created')) {
      return <CheckCircle className="w-3 h-3" />;
    }
    if (actionLower.includes('rejected')) {
      return <XCircle className="w-3 h-3" />;
    }
    if (actionLower.includes('rework')) {
      return <RotateCcw className="w-3 h-3" />;
    }
    if (actionLower.includes('forward')) {
      return <Forward className="w-3 h-3" />;
    }
    if (actionLower.includes('cancel')) {
      return <Ban className="w-3 h-3" />;
    }
    if (actionLower.includes('notification') || actionLower.includes('resend')) {
      return <Bell className="w-3 h-3" />;
    }
    if (actionLower.includes('pdf') || actionLower.includes('document')) {
      return <FileText className="w-3 h-3" />;
    }
    return <CheckCircle className="w-3 h-3" />;
  }

  function getActionColor(action: string, type: string): string {
    if (type === 'workflow_modification') {
      return 'bg-warning text-warning-foreground';
    }

    const actionLower = action.toLowerCase();
    if (actionLower.includes('rejected') || actionLower.includes('cancel')) {
      return 'bg-destructive text-destructive-foreground';
    }
    if (actionLower.includes('rework')) {
      return 'bg-warning text-warning-foreground';
    }
    if (actionLower.includes('forward')) {
      return 'bg-accent text-accent-foreground';
    }
    return 'bg-success text-success-foreground';
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display">Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-display">Activity Log</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {allEntries.map((entry, index) => (
            <div key={entry.id} className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${getActionColor(entry.action, entry.type)}`}>
                {getActionIcon(entry.action, entry.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{entry.action}</p>
                  {entry.type === 'workflow_modification' && (
                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px] py-0">
                      <Settings2 className="w-2.5 h-2.5 mr-1" />
                      Workflow
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')} by {entry.performed_by}
                </p>
                {entry.details && (
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    "{entry.details}"
                  </p>
                )}
                {entry.type === 'workflow_modification' && entry.reason && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Reason:</span> {entry.reason}
                  </p>
                )}
              </div>
            </div>
          ))}
          {allEntries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No activity recorded yet
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
