import { useMemo } from 'react';
import { useWorkPermits } from '@/hooks/useWorkPermits';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  Timer,
  BarChart3,
  PieChartIcon,
  Target,
  Settings2,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { differenceInHours, format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { downloadCsv, timestampedFilename } from '@/utils/csvExport';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--muted))'];

export default function Reports() {
  const { data: permits, isLoading } = useWorkPermits();

  // Fetch workflow audit data
  const { data: workflowAuditData } = useQuery({
    queryKey: ['workflow-audit-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permit_workflow_audit')
        .select('*, profiles:modified_by(full_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const stats = useMemo(() => {
    if (!permits || permits.length === 0) {
      return {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        closed: 0,
        slaBreached: 0,
        urgent: 0,
        avgApprovalTime: 0,
        slaComplianceRate: 0,
        workflowModified: 0,
        statusData: [],
        workTypeData: [],
        dailyData: [],
        approvalTimeByRole: [],
        workflowModificationsByType: [],
      };
    }

    const pending = permits.filter(p => p.status.startsWith('pending') || p.status === 'submitted').length;
    const approved = permits.filter(p => p.status === 'approved').length;
    const rejected = permits.filter(p => p.status === 'rejected').length;
    const closed = permits.filter(p => p.status === 'closed').length;
    const slaBreached = permits.filter(p => p.sla_breached).length;
    const urgent = permits.filter(p => p.urgency === 'urgent').length;
    const workflowModified = permits.filter(p => p.workflow_customized).length;

    // Calculate average approval time for completed permits
    const completedPermits = permits.filter(p => 
      p.status === 'approved' || p.status === 'closed'
    );

    let totalApprovalHours = 0;
    let approvalCount = 0;

    completedPermits.forEach(permit => {
      const helpdeskDate = permit.helpdesk_date ? parseISO(permit.helpdesk_date) : null;
      const createdAt = parseISO(permit.created_at);
      
      if (helpdeskDate) {
        totalApprovalHours += differenceInHours(helpdeskDate, createdAt);
        approvalCount++;
      }
    });

    const avgApprovalTime = approvalCount > 0 ? Math.round(totalApprovalHours / approvalCount) : 0;

    // SLA compliance rate
    const slaComplianceRate = permits.length > 0 
      ? Math.round(((permits.length - slaBreached) / permits.length) * 100) 
      : 100;

    // Status distribution for pie chart
    const statusData = [
      { name: 'Pending', value: pending, color: 'hsl(var(--warning))' },
      { name: 'Approved', value: approved, color: 'hsl(var(--success))' },
      { name: 'Rejected', value: rejected, color: 'hsl(var(--destructive))' },
      { name: 'Closed', value: closed, color: 'hsl(var(--muted))' },
    ].filter(d => d.value > 0);

    // Work type distribution
    const workTypeCounts: Record<string, number> = {};
    permits.forEach(p => {
      const typeName = p.work_types?.name || 'Unknown';
      workTypeCounts[typeName] = (workTypeCounts[typeName] || 0) + 1;
    });

    const workTypeData = Object.entries(workTypeCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Daily permits this month
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const days = eachDayOfInterval({ start: monthStart, end: now });

    const dailyData = days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const submitted = permits.filter(p => 
        format(parseISO(p.created_at), 'yyyy-MM-dd') === dayStr
      ).length;
      const completed = permits.filter(p => 
        (p.status === 'approved' || p.status === 'closed') &&
        p.helpdesk_date &&
        format(parseISO(p.helpdesk_date), 'yyyy-MM-dd') === dayStr
      ).length;

      return {
        date: format(day, 'MMM d'),
        submitted,
        completed,
      };
    });

    // Approval time by role
    const approvalTimeByRole = [
      { role: 'Helpdesk', avgHours: calculateAvgTime(permits, 'helpdesk') },
      { role: 'PM', avgHours: calculateAvgTime(permits, 'pm') },
      { role: 'PD', avgHours: calculateAvgTime(permits, 'pd') },
      { role: 'IT', avgHours: calculateAvgTime(permits, 'it') },
    ].filter(d => d.avgHours > 0);

    // Workflow modification breakdown
    const workflowModificationsByType = workflowAuditData?.reduce((acc, audit) => {
      const type = audit.modification_type === 'work_type_change' ? 'Work Type Change' : 'Custom Flow';
      const existing = acc.find(a => a.name === type);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ name: type, count: 1 });
      }
      return acc;
    }, [] as { name: string; count: number }[]) || [];

    return {
      total: permits.length,
      pending,
      approved,
      rejected,
      closed,
      slaBreached,
      urgent,
      avgApprovalTime,
      slaComplianceRate,
      workflowModified,
      statusData,
      workTypeData,
      dailyData,
      approvalTimeByRole,
      workflowModificationsByType,
    };
  }, [permits, workflowAuditData]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">
            Monitor permit performance, SLA compliance, and approval metrics
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!permits || permits.length === 0}
          onClick={() => {
            if (!permits) return;
            downloadCsv(timestampedFilename('permits-report'), permits, [
              { header: 'Permit No', accessor: (p: any) => p.permit_no },
              { header: 'Status', accessor: (p: any) => p.status },
              { header: 'Work Type', accessor: (p: any) => p.work_types?.name || '' },
              { header: 'Requester', accessor: (p: any) => p.requester_name },
              { header: 'Urgency', accessor: (p: any) => p.urgency },
              { header: 'SLA Deadline', accessor: (p: any) => p.sla_deadline || '' },
              { header: 'SLA Breached', accessor: (p: any) => p.sla_breached ? 'Yes' : 'No' },
              { header: 'Created', accessor: (p: any) => p.created_at },
              { header: 'Updated', accessor: (p: any) => p.updated_at || '' },
            ]);
          }}
        >
          <Download className="w-4 h-4 mr-2" />
          Export full dataset
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SLA Compliance</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.slaComplianceRate}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.slaBreached} permits breached SLA
            </p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className="h-full bg-success transition-all"
                style={{ width: `${stats.slaComplianceRate}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Approval Time</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgApprovalTime}h</div>
            <p className="text-xs text-muted-foreground">
              First approval (Helpdesk)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgent Permits</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.urgent}</div>
            <p className="text-xs text-muted-foreground">
              4-hour SLA requirement
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Modified Workflows</CardTitle>
            <Settings2 className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.workflowModified}</div>
            <p className="text-xs text-muted-foreground">
              Permits with custom flows
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Workflow Modifications Card */}
      {(workflowAuditData?.length || 0) > 0 && (
        <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-amber-600" />
              Workflow Modifications
            </CardTitle>
            <CardDescription>Recent workflow changes by approvers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Modification Type Breakdown */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">By Type</h4>
                {stats.workflowModificationsByType.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                    <span className="text-sm">{item.name}</span>
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                      {item.count}
                    </Badge>
                  </div>
                ))}
              </div>

              {/* Recent Modifications */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Recent Changes</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {workflowAuditData?.slice(0, 5).map((audit) => (
                    <div key={audit.id} className="flex items-center justify-between p-2 bg-background rounded border text-sm">
                      <div>
                        <p className="font-medium">{audit.modified_by_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {audit.modification_type === 'work_type_change' ? 'Changed work type' : 'Custom flow'}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(audit.created_at), 'MMM d')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row 1 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5" />
              Permit Status Distribution
            </CardTitle>
            <CardDescription>Current status breakdown of all permits</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {stats.statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {stats.statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Permits by Work Type
            </CardTitle>
            <CardDescription>Top 5 work types by volume</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {stats.workTypeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.workTypeData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Daily Permit Activity
            </CardTitle>
            <CardDescription>Submitted vs completed this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {stats.dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.dailyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="submitted" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="completed" 
                      stroke="hsl(var(--success))" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Avg. Approval Time by Role
            </CardTitle>
            <CardDescription>Hours taken for each approval step</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {stats.approvalTimeByRole.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.approvalTimeByRole}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="role" className="text-xs" />
                    <YAxis className="text-xs" label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
                    <Tooltip formatter={(value) => [`${value}h`, 'Avg Time']} />
                    <Bar dataKey="avgHours" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No approval data yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SLA Breach Table */}
      {permits && permits.filter(p => p.sla_breached).length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              SLA Breached Permits
            </CardTitle>
            <CardDescription>Permits that exceeded their SLA deadline</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {permits.filter(p => p.sla_breached).slice(0, 10).map(permit => (
                <div 
                  key={permit.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20"
                >
                  <div>
                    <p className="font-medium">{permit.permit_no}</p>
                    <p className="text-sm text-muted-foreground">
                      {permit.work_types?.name || 'Unknown Type'} • {permit.contractor_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={permit.urgency === 'urgent' ? 'destructive' : 'secondary'}>
                      {permit.urgency === 'urgent' ? '4hr SLA' : '48hr SLA'}
                    </Badge>
                    <Badge variant="outline">{permit.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

// Helper function to calculate average approval time for a role
function calculateAvgTime(permits: any[], role: string): number {
  const relevantPermits = permits.filter(p => 
    p[`${role}_status`] === 'approved' && p[`${role}_date`]
  );

  if (relevantPermits.length === 0) return 0;

  let totalHours = 0;
  relevantPermits.forEach(permit => {
    const approvalDate = parseISO(permit[`${role}_date`]);
    const createdAt = parseISO(permit.created_at);
    totalHours += differenceInHours(approvalDate, createdAt);
  });

  return Math.round(totalHours / relevantPermits.length);
}
