import { useState, useMemo } from 'react';
import { useUserActivityLogs, actionTypeLabels } from '@/hooks/useUserActivityLogs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Search,
  Activity,
  LogIn,
  LogOut,
  AlertCircle,
  UserCog,
  FileText,
  Download,
  X,
} from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import { exportRowsToCsv } from '@/utils/csvExport';

const actionTypeIcons: Record<string, React.ReactNode> = {
  login: <LogIn className="h-4 w-4 text-success" />,
  permit_approve: <FileText className="h-4 w-4 text-success" />,
  user_create: <UserCog className="h-4 w-4 text-success" />,
  login_failed: <AlertCircle className="h-4 w-4 text-destructive" />,
  permit_reject: <FileText className="h-4 w-4 text-destructive" />,
  password_change: <UserCog className="h-4 w-4 text-warning" />,
  permit_forward: <FileText className="h-4 w-4 text-warning" />,
  permit_rework: <FileText className="h-4 w-4 text-warning" />,
  user_status_change: <UserCog className="h-4 w-4 text-warning" />,
  profile_update: <UserCog className="h-4 w-4 text-info" />,
  permit_create: <FileText className="h-4 w-4 text-primary" />,
  user_role_change: <UserCog className="h-4 w-4 text-accent-foreground" />,
  logout: <LogOut className="h-4 w-4 text-muted-foreground" />,
};

const actionTypeBadgeVariant = (
  actionType: string,
): 'default' | 'secondary' | 'destructive' | 'outline' => {
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

type DatePreset = 'all' | '24h' | '7d' | '30d';

export default function UserActivityLogs() {
  const { data: logs, isLoading } = useUserActivityLogs();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');

  const uniqueActionTypes = useMemo(
    () => [...new Set(logs?.map((log) => log.action_type) || [])],
    [logs],
  );
  const uniqueUsers = useMemo(
    () => [...new Set(logs?.map((log) => log.user_email) || [])].sort(),
    [logs],
  );

  const cutoffDate = useMemo(() => {
    if (datePreset === 'all') return null;
    const now = new Date();
    if (datePreset === '24h') return subDays(now, 1);
    if (datePreset === '7d') return startOfDay(subDays(now, 7));
    if (datePreset === '30d') return startOfDay(subDays(now, 30));
    return null;
  }, [datePreset]);

  const filteredLogs = useMemo(() => {
    return (logs || []).filter((log) => {
      const matchesSearch =
        !searchQuery ||
        log.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesAction = actionFilter === 'all' || log.action_type === actionFilter;
      const matchesUser = userFilter === 'all' || log.user_email === userFilter;
      const matchesDate =
        !cutoffDate || new Date(log.created_at) >= cutoffDate;
      return matchesSearch && matchesAction && matchesUser && matchesDate;
    });
  }, [logs, searchQuery, actionFilter, userFilter, cutoffDate]);

  const totalCount = logs?.length ?? 0;
  const filteredCount = filteredLogs.length;
  const hasActiveFilter =
    searchQuery !== '' ||
    actionFilter !== 'all' ||
    userFilter !== 'all' ||
    datePreset !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setActionFilter('all');
    setUserFilter('all');
    setDatePreset('all');
  };

  const handleExport = () => {
    exportRowsToCsv(
      `activity-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      filteredLogs,
      [
        { header: 'Timestamp', accessor: (l) => format(new Date(l.created_at), 'yyyy-MM-dd HH:mm:ss') },
        { header: 'User Email', accessor: 'user_email' },
        { header: 'Action', accessor: (l) => actionTypeLabels[l.action_type] || l.action_type },
        { header: 'Details', accessor: (l) => l.details || '' },
        { header: 'IP Address', accessor: (l) => l.ip_address || '' },
        { header: 'User Agent', accessor: (l) => l.user_agent || '' },
      ],
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Activity Logs</h1>
          <p className="text-muted-foreground">
            View login history and actions performed by users
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={filteredCount === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
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
          {/* Date presets */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground mr-1">Range:</span>
            {([
              { id: 'all', label: 'All time' },
              { id: '24h', label: 'Last 24h' },
              { id: '7d', label: 'Last 7 days' },
              { id: '30d', label: 'Last 30 days' },
            ] as { id: DatePreset; label: string }[]).map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={datePreset === p.id ? 'default' : 'outline'}
                onClick={() => setDatePreset(p.id)}
              >
                {p.label}
              </Button>
            ))}
            {hasActiveFilter && (
              <Button size="sm" variant="ghost" onClick={clearFilters} className="ml-auto">
                <X className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            )}
          </div>

          {/* Search + filters row */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or details..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {uniqueUsers.map((email) => (
                  <SelectItem key={email} value={email}>
                    {email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
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

          {/* Result count */}
          <div className="text-sm text-muted-foreground mb-3">
            {hasActiveFilter ? (
              <>Showing <span className="font-medium text-foreground">{filteredCount}</span> of {totalCount}</>
            ) : (
              <>{totalCount} total entries</>
            )}
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
                {filteredLogs.map((log) => (
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
                          {log.user_agent.includes('Chrome')
                            ? 'Chrome'
                            : log.user_agent.includes('Firefox')
                            ? 'Firefox'
                            : log.user_agent.includes('Safari')
                            ? 'Safari'
                            : log.user_agent.includes('Edge')
                            ? 'Edge'
                            : 'Other'}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLogs.length === 0 && (
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
