import { useState } from 'react';
import { useUserActivityLogs, actionTypeLabels } from '@/hooks/useUserActivityLogs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Activity, LogIn, LogOut, AlertCircle, UserCog, FileText } from 'lucide-react';
import { format } from 'date-fns';

const actionTypeIcons: Record<string, React.ReactNode> = {
  // Positive / completion outcomes — success
  login: <LogIn className="h-4 w-4 text-success" />,
  permit_approve: <FileText className="h-4 w-4 text-success" />,
  user_create: <UserCog className="h-4 w-4 text-success" />,
  // Failure / negative outcomes — destructive
  login_failed: <AlertCircle className="h-4 w-4 text-destructive" />,
  permit_reject: <FileText className="h-4 w-4 text-destructive" />,
  // In-progress / attention-needed states — warning
  password_change: <UserCog className="h-4 w-4 text-warning" />,
  permit_forward: <FileText className="h-4 w-4 text-warning" />,
  permit_rework: <FileText className="h-4 w-4 text-warning" />,
  user_status_change: <UserCog className="h-4 w-4 text-warning" />,
  // Informational — info (was blue)
  profile_update: <UserCog className="h-4 w-4 text-info" />,
  // Brand-emphasized — primary
  permit_create: <FileText className="h-4 w-4 text-primary" />,
  // Special category change — accent (was purple)
  user_role_change: <UserCog className="h-4 w-4 text-accent-foreground" />,
  // Neutral terminal — muted
  logout: <LogOut className="h-4 w-4 text-muted-foreground" />,
};

const actionTypeBadgeVariant = (actionType: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (actionType) {
    case 'login':
    case 'permit_approve':
    case 'user_create':
      return 'default';
    case 'login_failed':
    case 'permit_reject':
      return 'destructive';
    case 'logout':
      return 'outline';
    default:
      return 'secondary';
  }
};

export default function UserActivityLogs() {
  const { data: logs, isLoading } = useUserActivityLogs();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const filteredLogs = logs?.filter((log) => {
    const matchesSearch =
      log.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = actionFilter === 'all' || log.action_type === actionFilter;
    return matchesSearch && matchesAction;
  });

  const uniqueActionTypes = [...new Set(logs?.map((log) => log.action_type) || [])];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Activity Logs</h1>
        <p className="text-muted-foreground">
          View login history and actions performed by users
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity History
          </CardTitle>
          <CardDescription>
            Recent user activities including logins, logouts, and system actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or details..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {uniqueActionTypes.map((action) => (
                  <SelectItem key={action} value={action}>
                    {actionTypeLabels[action] || action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="w-[160px]">Action</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-[200px]">User Agent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {format(new Date(log.created_at), 'MMM d, yyyy HH:mm:ss')}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{log.user_email}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={actionTypeBadgeVariant(log.action_type)}
                        className="flex items-center gap-1 w-fit"
                      >
                        {actionTypeIcons[log.action_type] || <Activity className="h-4 w-4" />}
                        {actionTypeLabels[log.action_type] || log.action_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                      {log.details || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {log.user_agent ? (
                        <span title={log.user_agent}>
                          {log.user_agent.includes('Chrome') ? 'Chrome' : 
                           log.user_agent.includes('Firefox') ? 'Firefox' :
                           log.user_agent.includes('Safari') ? 'Safari' :
                           log.user_agent.includes('Edge') ? 'Edge' : 'Other'}
                        </span>
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLogs?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No activity logs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
