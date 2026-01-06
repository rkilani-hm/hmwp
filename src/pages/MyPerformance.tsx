import { useMyPerformance } from '@/hooks/useApproverPerformance';
import { StatsCard } from '@/components/ui/StatsCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  Timer,
  Target,
  Activity,
  ClipboardList,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

const roleLabels: Record<string, string> = {
  helpdesk: 'Helpdesk',
  pm: 'Property Management',
  pd: 'Project Development',
  bdcr: 'BDCR',
  mpr: 'MPR',
  it: 'IT Department',
  fitout: 'Fit-Out',
  ecovert_supervisor: 'Ecovert Supervisor',
  pmd_coordinator: 'PMD Coordinator',
  admin: 'Administrator',
};

export default function MyPerformance() {
  const { data: metrics, isLoading } = useMyPerformance();

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
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No performance data available.</p>
      </div>
    );
  }

  // Chart data
  const decisionData = [
    { name: 'Approved', value: metrics.approvals, color: 'hsl(var(--success))' },
    { name: 'Rejected', value: metrics.rejections, color: 'hsl(var(--destructive))' },
  ].filter(d => d.value > 0);

  const slaData = [
    { name: 'On Time', value: metrics.completedOnTime, color: 'hsl(var(--success))' },
    { name: 'Late', value: metrics.completedLate, color: 'hsl(var(--destructive))' },
  ].filter(d => d.value > 0);

  const responseTimeDisplay = metrics.averageResponseTimeHours >= 1 
    ? `${metrics.averageResponseTimeHours}h`
    : `${metrics.averageResponseTimeMinutes}m`;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">My Performance</h1>
          <p className="text-muted-foreground mt-1">
            Track your approval metrics and response times
          </p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {roleLabels[metrics.role] || metrics.role}
        </Badge>
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Decisions"
          value={metrics.totalDecisions}
          icon={ClipboardList}
          variant="primary"
        />
        <StatsCard
          title="Approval Rate"
          value={`${metrics.approvalRate}%`}
          icon={CheckCircle}
          variant={metrics.approvalRate >= 80 ? 'success' : metrics.approvalRate >= 60 ? 'warning' : 'destructive'}
        />
        <StatsCard
          title="Avg Response Time"
          value={responseTimeDisplay}
          icon={Timer}
          variant="primary"
        />
        <StatsCard
          title="SLA Compliance"
          value={`${metrics.slaCompliance}%`}
          icon={Target}
          variant={metrics.slaCompliance >= 90 ? 'success' : metrics.slaCompliance >= 70 ? 'warning' : 'destructive'}
        />
      </motion.div>

      {/* Pending Alert */}
      {metrics.pendingCount > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-warning/50 bg-warning/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-warning/10">
                  <Zap className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <h3 className="font-semibold">
                    {metrics.pendingCount} Permit{metrics.pendingCount > 1 ? 's' : ''} Awaiting Your Action
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    You have pending permits in your inbox that require your review.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Charts Row */}
      <motion.div variants={itemVariants} className="grid lg:grid-cols-2 gap-6">
        {/* Decision Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Activity className="w-5 h-5 text-accent" />
              Decision Distribution
            </CardTitle>
            <CardDescription>Breakdown of your approval decisions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {decisionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={decisionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {decisionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No decisions made yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* SLA Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-success" />
              SLA Performance
            </CardTitle>
            <CardDescription>Your compliance with SLA deadlines</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">SLA Compliance Rate</span>
                  <span className="text-sm font-bold">{metrics.slaCompliance}%</span>
                </div>
                <Progress 
                  value={metrics.slaCompliance} 
                  className="h-3"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-success/10 rounded-lg border border-success/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-success" />
                    <span className="text-sm font-medium">On Time</span>
                  </div>
                  <p className="text-2xl font-bold mt-2">{metrics.completedOnTime}</p>
                </div>
                <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-destructive" />
                    <span className="text-sm font-medium">Late</span>
                  </div>
                  <p className="text-2xl font-bold mt-2">{metrics.completedLate}</p>
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-medium">Last 30 Days</span>
                </div>
                <p className="text-2xl font-bold mt-2">{metrics.last30DaysDecisions} decisions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Summary Card */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display">Performance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{metrics.totalDecisions}</p>
                <p className="text-sm text-muted-foreground mt-1">Total Decisions</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-success">{metrics.approvals}</p>
                <p className="text-sm text-muted-foreground mt-1">Approvals</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-destructive">{metrics.rejections}</p>
                <p className="text-sm text-muted-foreground mt-1">Rejections</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-warning">{metrics.pendingCount}</p>
                <p className="text-sm text-muted-foreground mt-1">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
