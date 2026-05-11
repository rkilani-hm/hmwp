import { useState, useMemo } from 'react';
import { useUserActivityLogs, actionTypeLabels } from '@/hooks/useUserActivityLogs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Activity, LogIn, LogOut, AlertCircle, UserCog, FileText, X } from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay, isWithinInterval, subDays } from 'date-fns';

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
  const [userFilter, setUserFilter] = useState<string>('all');
  // Date range defaults to "all time" so default behavior matches
  // the previous version. Admin opts in to narrowing.
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Unique users + actions for the dropdowns. Memoized so the
  // dropdown rendering doesn't recompute on every keystroke in the
  // search box.
  const uniqueUserEmails = useMemo(
    () => [...new Set(logs?.map((log) => log.user_email).filter(Boolean) || [])].sort(),
    [logs],
  );
  const uniqueActionTypes = useMemo(
    () => [...new Set(logs?.map((log) => log.action_type) || [])].sort(),
    [logs],
  );

  const filteredLogs = useMemo(() => {
    return logs?.filter((log) => {
      // Search (email + details — free-text)
      const matchesSearch =
        !searchQuery ||
        log.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details?.toLowerCase().includes(searchQuery.toLowerCase());

      // Action type dropdown
      const matchesAction = actionFilter === 'all' || log.action_type === actionFilter;

      // User email dropdown
      const matchesUser = userFilter === 'all' || log.user_email === userFilter;

      // Date range (both bounds optional)
      let matchesDate = true;
      if (dateFrom || dateTo) {
        try {
          const ts = parseISO(log.created_at);
          if (dateFrom && ts < startOfDay(parseISO(dateFrom))) matchesDate = false;
          if (dateTo && ts > endOfDay(parseISO(dateTo))) matchesDate = false;
        } catch {
          matchesDate = false;
        }
      }

      return matchesSearch && matchesAction && matchesUser && matchesDate;
    }) ?? [];
  }, [logs, searchQuery, actionFilter, userFilter, dateFrom, dateTo]);

  const hasActiveFilter =
    searchQuery !== '' ||
    actionFilter !== 'all' ||
    userFilter !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '';

  const clearAllFilters = () => {
    setSearchQuery('');
    setActionFilter('all');
    setUserFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  // Quick date presets — admins ask "what happened in the last 7 days"
  // far more often than they specify exact dates.
  const applyDatePreset = (preset: '24h' | '7d' | '30d') => {
    const now = new Date();
    setDateTo(format(now, 'yyyy-MM-dd'));
    if (preset === '24h') setDateFrom(format(subDays(now, 1), 'yyyy-MM-dd'));
    else if (preset === '7d') setDateFrom(format(subDays(now, 7), 'yyyy-MM-dd'));
    else if (preset === '30d') setDateFrom(format(subDays(now, 30), 'yyyy-MM-dd'));
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
          <div className="space-y-3 mb-6">
            {/* Top row: search + action + user dropdowns */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
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
                <SelectTrigger className="md:w-[200px]">
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
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="md:w-[240px]">
                  <SelectValue placeholder="Filter by user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {uniqueUserEmails.map((email) => (
                    <SelectItem key={email} value={email}>
                      {email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date range row */}
            <div className="flex flex-col lg:flex-row lg:items-end gap-3 pt-1">
              <div className="flex gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="log-date-from" className="text-xs">From</Label>
                  <Input
                    id="log-date-from"
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="log-date-to" className="text-xs">To</Label>
                  <Input
                    id="log-date-to"
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-44"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => applyDatePreset('24h')}>Last 24 hrs</Button>
                <Button variant="outline" size="sm" onClick={() => applyDatePreset('7d')}>Last 7 days</Button>
                <Button variant="outline" size="sm" onClick={() => applyDatePreset('30d')}>Last 30 days</Button>
              </div>
              <div className="flex-1 flex justify-end gap-3 items-center">
                {hasActiveFilter && (
                  <>
                    <span className="text-sm text-muted-foreground">
                      {filteredLogs.length} of {logs?.length ?? 0} entries
                    </span>
                    <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                      <X className="w-3 h-3 mr-1" />
                      Clear all
                    </Button>
                  </>
                )}
              </div>
            </div>
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
