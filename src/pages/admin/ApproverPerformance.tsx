import { useState } from 'react';
import { useAllApproversPerformance, useApproverRoleNames } from '@/hooks/useApproverPerformance';
import { DateRangePresets, type DateRange, type DateRangePreset, presetToRange } from '@/components/ui/DateRangePresets';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { StatsCard } from '@/components/ui/StatsCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  TrendingUp,
  Clock,
  Target,
  Award,
  Timer,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Settings2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
} from 'recharts';

// Humanize a snake_case role name for display. Built-in roles get
// curated labels; custom roles fall through to mechanical Title Case
// so dynamic-workflow additions (e.g. al_hamra_customer_service)
// render properly without code changes.
function humanizeRole(role: string | null | undefined): string {
  if (!role) return '';
  const overrides: Record<string, string> = {
    helpdesk: 'Helpdesk',
    pm: 'Property Mgmt',
    pd: 'Project Dev',
    bdcr: 'BDCR',
    mpr: 'MPR',
    it: 'IT',
    fitout: 'Fit-Out',
  };
  const key = role.toLowerCase();
  if (overrides[key]) return overrides[key];
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Deterministic color for a role name. Curated palette for legacy
// roles, hash-based fallback for new/custom roles so the same role
// always gets the same color across renders.
const CURATED_ROLE_COLORS: Record<string, string> = {
  helpdesk: '#3b82f6',
  pm: '#8b5cf6',
  pd: '#10b981',
  bdcr: '#f59e0b',
  mpr: '#ef4444',
  it: '#06b6d4',
  fitout: '#ec4899',
  ecovert_supervisor: '#84cc16',
  pmd_coordinator: '#6366f1',
  customer_service: '#14b8a6',
  cr_coordinator: '#f97316',
  head_cr: '#a855f7',
  fmsp_approval: '#0ea5e9',
};
const FALLBACK_PALETTE = [
  '#dc2626', '#d97706', '#65a30d', '#0d9488', '#0284c7',
  '#7c3aed', '#c026d3', '#be185d', '#9333ea', '#15803d',
];
function roleColor(role: string | null | undefined): string {
  if (!role) return '#6b7280';
  const key = role.toLowerCase();
  if (CURATED_ROLE_COLORS[key]) return CURATED_ROLE_COLORS[key];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

export default function ApproverPerformance() {
  const [preset, setPreset] = useState<DateRangePreset>('30d');
  const [range, setRange] = useState<DateRange>(presetToRange('30d'));
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const { data: roleNames } = useApproverRoleNames();
  const { data: approvers, isLoading } = useAllApproversPerformance({
    from: range.from,
    to: range.to,
    role: roleFilter === 'all' ? null : roleFilter,
  });

  // Fetch workflow modification stats per approver
  const { data: workflowModifications } = useQuery({
    queryKey: ['approver-workflow-modifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permit_workflow_audit')
        .select('modified_by, modified_by_name, modification_type');

      if (error) throw error;

      // Count modifications per user
      const modsByUser = new Map<string, { name: string; count: number }>();
      data?.forEach(mod => {
        const existing = modsByUser.get(mod.modified_by);
        if (existing) {
          existing.count++;
        } else {
          modsByUser.set(mod.modified_by, { name: mod.modified_by_name, count: 1 });
        }
      });

      return modsByUser;
    },
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Filter bar shown above the page; moved out of the early-empty
  // branch so users can adjust filters even when the current range
  // returns no rows.
  const filterBar = (
    <div className="flex flex-wrap items-center gap-3">
      <DateRangePresets
        preset={preset}
        onPresetChange={setPreset}
        range={range}
        onRangeChange={(r) => { setRange(r); setPreset('all'); }}
      />
      <Select value={roleFilter} onValueChange={setRoleFilter}>
        <SelectTrigger className="h-8 w-[200px]">
          <SelectValue placeholder="All roles" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All roles</SelectItem>
          {(roleNames || []).slice().sort().map((r) => (
            <SelectItem key={r} value={r}>{humanizeRole(r)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  if (!approvers || approvers.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Approver Performance</h1>
          <p className="text-muted-foreground mt-1">
            Monitor all approvers' metrics and identify bottlenecks
          </p>
        </div>
        {filterBar}
        <div className="flex items-center justify-center h-48">
          <p className="text-muted-foreground">No approver performance data for the current filters.</p>
        </div>
      </div>
    );
  }

  // Aggregate stats
  const totalDecisions = approvers.reduce((sum, a) => sum + a.totalDecisions, 0);
  const totalPending = approvers.reduce((sum, a) => sum + a.pendingCount, 0);
  const avgSlaCompliance = approvers.length > 0 
    ? Math.round(approvers.reduce((sum, a) => sum + a.slaCompliance, 0) / approvers.length)
    : 0;
  const avgResponseTime = approvers.length > 0
    ? Math.round(approvers.reduce((sum, a) => sum + a.averageResponseTimeHours, 0) / approvers.length * 10) / 10
    : 0;
  const totalWorkflowMods = workflowModifications 
    ? Array.from(workflowModifications.values()).reduce((sum, m) => sum + m.count, 0)
    : 0;

  // Chart data - top performers by decisions
  const chartData = approvers
    .slice(0, 10)
    .map(a => ({
      name: a.userName.split(' ')[0] || a.userEmail.split('@')[0],
      decisions: a.totalDecisions,
      sla: a.slaCompliance,
      role: a.role,
    }));

  // Role distribution
  const roleData = Object.entries(
    approvers.reduce((acc, a) => {
      acc[a.role] = (acc[a.role] || 0) + a.totalDecisions;
      return acc;
    }, {} as Record<string, number>)
  ).map(([role, count]) => ({
    name: humanizeRole(role),
    value: count,
    color: roleColor(role),
  }));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl md:text-3xl font-display font-bold">Approver Performance</h1>
        <p className="text-muted-foreground mt-1">
          Monitor all approvers' metrics and identify bottlenecks
        </p>
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard
          title="Total Approvers"
          value={approvers.length}
          icon={Users}
          variant="primary"
        />
        <StatsCard
          title="Total Decisions"
          value={totalDecisions}
          icon={CheckCircle}
          variant="success"
        />
        <StatsCard
          title="Pending Items"
          value={totalPending}
          icon={AlertTriangle}
          variant={totalPending > 10 ? 'warning' : 'primary'}
        />
        <StatsCard
          title="Avg SLA Compliance"
          value={`${avgSlaCompliance}%`}
          icon={Target}
          variant={avgSlaCompliance >= 90 ? 'success' : avgSlaCompliance >= 70 ? 'warning' : 'destructive'}
        />
        <StatsCard
          title="Workflow Mods"
          value={totalWorkflowMods}
          icon={Settings2}
          variant="default"
        />
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants}>
        {filterBar}
      </motion.div>

      {/* Charts Row */}
      <motion.div variants={itemVariants} className="grid lg:grid-cols-2 gap-6">
        {/* Top Performers Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Award className="w-5 h-5 text-warning" />
              Top Performers by Decisions
            </CardTitle>
            <CardDescription>Approvers with most decisions made</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={80} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value, name) => [value, name === 'decisions' ? 'Decisions' : 'SLA %']}
                  />
                  <Bar dataKey="decisions" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={roleColor(entry.role)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Role Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-success" />
              Decisions by Role
            </CardTitle>
            <CardDescription>Distribution of decisions across roles</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roleData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {roleData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* SLA Breach Visual */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              SLA Compliance by Approver
            </CardTitle>
            <CardDescription>Approvers with SLA breaches highlighted in red</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const slaData = approvers
                .filter(a => a.completedOnTime + a.completedLate > 0)
                .map(a => ({
                  name: a.userName.split(' ')[0] || a.userEmail.split('@')[0],
                  fullName: a.userName,
                  onTime: a.completedOnTime,
                  late: a.completedLate,
                  compliance: a.slaCompliance,
                  role: a.role,
                }))
                .sort((a, b) => a.compliance - b.compliance);

              if (slaData.length === 0) {
                return <p className="text-muted-foreground text-center py-8">No SLA data available yet.</p>;
              }

              return (
                <div className="space-y-6">
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={slaData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis type="number" domain={[0, 'dataMax']} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis
                          dataKey="name"
                          type="category"
                          width={80}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number, name: string) => [
                            value,
                            name === 'onTime' ? 'On Time' : 'Late (SLA Breached)',
                          ]}
                        />
                        <Legend
                          formatter={(value: string) =>
                            value === 'onTime' ? 'On Time' : 'Late (SLA Breached)'
                          }
                        />
                        <Bar dataKey="onTime" stackId="a" fill="hsl(var(--success, 142 71% 45%))" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="late" stackId="a" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Breaching approvers list */}
                  {slaData.filter(a => a.late > 0).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                        <XCircle className="w-4 h-4" />
                        Approvers Breaching SLA
                      </h4>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {slaData
                          .filter(a => a.late > 0)
                          .map((a, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between p-3 rounded-lg border border-destructive/30 bg-destructive/5"
                            >
                              <div>
                                <p className="text-sm font-medium">{a.fullName}</p>
                                <Badge
                                  variant="outline"
                                  className="text-xs mt-0.5"
                                  style={{ borderColor: roleColor(a.role), color: roleColor(a.role) }}
                                >
                                  {humanizeRole(a.role)}
                                </Badge>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-destructive">{a.late} late</p>
                                <p className="text-xs text-muted-foreground">{a.compliance}% compliant</p>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </motion.div>

      {/* Approvers Table */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display">All Approvers</CardTitle>
            <CardDescription>Detailed performance metrics for each approver</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Approver</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-center">Decisions</TableHead>
                    <TableHead className="text-center">Approval Rate</TableHead>
                    <TableHead className="text-center">Avg Response</TableHead>
                    <TableHead className="text-center">SLA Compliance</TableHead>
                    <TableHead className="text-center">Pending</TableHead>
                    <TableHead className="text-center">Workflow Mods</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvers.map((approver) => {
                    const modCount = workflowModifications?.get(approver.userId)?.count || 0;
                    return (
                    <TableRow key={`${approver.userId}-${approver.role}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{approver.userName}</p>
                          <p className="text-xs text-muted-foreground">{approver.userEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline"
                          style={{ borderColor: roleColor(approver.role), color: roleColor(approver.role) }}
                        >
                          {humanizeRole(approver.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {approver.totalDecisions}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Progress value={approver.approvalRate} className="w-16 h-2" />
                          <span className="text-sm">{approver.approvalRate}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {approver.averageResponseTimeHours >= 1 
                          ? `${approver.averageResponseTimeHours}h`
                          : `${approver.averageResponseTimeMinutes}m`
                        }
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={approver.slaCompliance >= 90 ? 'default' : approver.slaCompliance >= 70 ? 'secondary' : 'destructive'}
                          className={
                            approver.slaCompliance >= 90 
                              ? 'bg-success/20 text-success border-success/30' 
                              : approver.slaCompliance >= 70 
                                ? 'bg-warning/20 text-warning border-warning/30'
                                : ''
                          }
                        >
                          {approver.slaCompliance}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {approver.pendingCount > 0 ? (
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                            {approver.pendingCount}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {modCount > 0 ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                            {modCount}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
