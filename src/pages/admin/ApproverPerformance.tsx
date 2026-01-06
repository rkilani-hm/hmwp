import { useAllApproversPerformance } from '@/hooks/useApproverPerformance';
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

const roleLabels: Record<string, string> = {
  helpdesk: 'Helpdesk',
  pm: 'Property Mgmt',
  pd: 'Project Dev',
  bdcr: 'BDCR',
  mpr: 'MPR',
  it: 'IT',
  fitout: 'Fit-Out',
  ecovert_supervisor: 'Ecovert Supervisor',
  pmd_coordinator: 'PMD Coordinator',
};

const roleColors: Record<string, string> = {
  helpdesk: '#3b82f6',
  pm: '#8b5cf6',
  pd: '#10b981',
  bdcr: '#f59e0b',
  mpr: '#ef4444',
  it: '#06b6d4',
  fitout: '#ec4899',
  ecovert_supervisor: '#84cc16',
  pmd_coordinator: '#6366f1',
};

export default function ApproverPerformance() {
  const { data: approvers, isLoading } = useAllApproversPerformance();

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

  if (!approvers || approvers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No approver performance data available.</p>
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
    name: roleLabels[role] || role,
    value: count,
    color: roleColors[role] || '#6b7280',
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
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
                      <Cell key={`cell-${index}`} fill={roleColors[entry.role] || '#6b7280'} />
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvers.map((approver) => (
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
                          style={{ borderColor: roleColors[approver.role], color: roleColors[approver.role] }}
                        >
                          {roleLabels[approver.role] || approver.role}
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
