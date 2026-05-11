import { useState } from 'react';
import { useSLAStats } from '@/hooks/useSLAStats';
import { StatsCard } from '@/components/ui/StatsCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Progress } from '@/components/ui/progress';
import { format, subDays, startOfMonth } from 'date-fns';
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  Timer,
  Zap,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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
  Legend,
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts';

export default function SLADashboard() {
  const navigate = useNavigate();

  // Date-range filter passed into useSLAStats. Defaults to last 30
  // days so the breached/at-risk lists reflect recent activity rather
  // than the entire history.
  const today = format(new Date(), 'yyyy-MM-dd');
  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);

  const { metrics, breachedPermits, atRiskPermits, dailyMetrics, isLoading } =
    useSLAStats({ dateFrom, dateTo });

  const applyPreset = (preset: '7d' | '30d' | 'mtd' | 'all') => {
    const now = new Date();
    setDateTo(format(now, 'yyyy-MM-dd'));
    if (preset === '7d') setDateFrom(format(subDays(now, 7), 'yyyy-MM-dd'));
    else if (preset === '30d') setDateFrom(format(subDays(now, 30), 'yyyy-MM-dd'));
    else if (preset === 'mtd') setDateFrom(format(startOfMonth(now), 'yyyy-MM-dd'));
    else setDateFrom('2020-01-01');
  };

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

  // Chart data
  const slaStatusData = [
    { name: 'On Track', value: metrics.onTrackPermits, color: 'hsl(var(--success))' },
    { name: 'At Risk', value: metrics.atRiskPermits, color: 'hsl(var(--warning))' },
    { name: 'Breached', value: metrics.breachedPermits, color: 'hsl(var(--destructive))' },
  ].filter(d => d.value > 0);

  const urgencyData = [
    { name: 'Urgent (4hr SLA)', value: metrics.urgentPermits, color: 'hsl(var(--destructive))' },
    { name: 'Normal (48hr SLA)', value: metrics.normalPermits, color: 'hsl(var(--accent))' },
  ].filter(d => d.value > 0);

  const complianceData = [
    { name: 'On Time', value: metrics.completedOnTime, color: 'hsl(var(--success))' },
    { name: 'Late', value: metrics.completedLate, color: 'hsl(var(--destructive))' },
  ].filter(d => d.value > 0);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl md:text-3xl font-display font-bold">SLA Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Monitor service level agreements and permit processing times
        </p>
      </motion.div>

      {/* Date range controls */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div className="flex gap-3 flex-1">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sla-date-from" className="text-xs">From</Label>
                  <Input
                    id="sla-date-from"
                    type="date"
                    value={dateFrom}
                    max={dateTo}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sla-date-to" className="text-xs">To</Label>
                  <Input
                    id="sla-date-to"
                    type="date"
                    value={dateTo}
                    min={dateFrom}
                    max={today}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-44"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => applyPreset('7d')}>Last 7 days</Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset('30d')}>Last 30 days</Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset('mtd')}>This month</Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset('all')}>All time</Button>
              </div>
              <div className="text-sm text-muted-foreground self-end">
                {metrics.totalPermits} permit{metrics.totalPermits === 1 ? '' : 's'} in range
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* SLA Compliance Alert */}
      {(metrics.breachedPermits > 0 || metrics.atRiskPermits > 0) && (
        <motion.div variants={itemVariants}>
          <Card className={metrics.breachedPermits > 0 ? 'border-destructive/50 bg-destructive/5' : 'border-warning/50 bg-warning/5'}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-full ${metrics.breachedPermits > 0 ? 'bg-destructive/10' : 'bg-warning/10'}`}>
                  <AlertTriangle className={`w-6 h-6 ${metrics.breachedPermits > 0 ? 'text-destructive' : 'text-warning'}`} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">
                    {metrics.breachedPermits > 0 
                      ? `${metrics.breachedPermits} SLA Breach${metrics.breachedPermits > 1 ? 'es' : ''} Detected`
                      : `${metrics.atRiskPermits} Permit${metrics.atRiskPermits > 1 ? 's' : ''} At Risk`
                    }
                  </h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    {metrics.breachedPermits > 0 
                      ? 'Immediate action required. These permits have exceeded their SLA deadline.'
                      : 'These permits are approaching their SLA deadline within 2 hours.'
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Stats Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="SLA Compliance"
          value={`${metrics.slaComplianceRate}%`}
          icon={CheckCircle}
          variant={metrics.slaComplianceRate >= 90 ? 'success' : metrics.slaComplianceRate >= 70 ? 'warning' : 'destructive'}
        />
        <StatsCard
          title="Breached"
          value={metrics.breachedPermits}
          icon={XCircle}
          variant="destructive"
        />
        <StatsCard
          title="At Risk"
          value={metrics.atRiskPermits}
          icon={AlertTriangle}
          variant="warning"
        />
        <StatsCard
          title="Avg. Resolution"
          value={`${metrics.averageResolutionHours}h`}
          icon={Timer}
          variant="primary"
        />
      </motion.div>

      {/* Charts Row */}
      <motion.div variants={itemVariants} className="grid lg:grid-cols-2 gap-6">
        {/* Daily Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Activity className="w-5 h-5 text-accent" />
              7-Day Trend
            </CardTitle>
            <CardDescription>Permit activity over the last week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyMetrics}>
                  <defs>
                    <linearGradient id="colorSubmitted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="submitted" 
                    stroke="hsl(var(--accent))" 
                    fillOpacity={1} 
                    fill="url(#colorSubmitted)" 
                    name="Submitted"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="completed" 
                    stroke="hsl(var(--success))" 
                    fillOpacity={1} 
                    fill="url(#colorCompleted)" 
                    name="Completed"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* SLA Status Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent" />
              Active Permits SLA Status
            </CardTitle>
            <CardDescription>Current status of pending permits</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {slaStatusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slaStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {slaStatusData.map((entry, index) => (
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
                  No active permits
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Second Row of Charts */}
      <motion.div variants={itemVariants} className="grid lg:grid-cols-2 gap-6">
        {/* Urgency Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Zap className="w-5 h-5 text-warning" />
              Urgency Distribution
            </CardTitle>
            <CardDescription>Breakdown by priority level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {urgencyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={urgencyData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {urgencyData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No permits yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Completion Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-success" />
              Completion Performance
            </CardTitle>
            <CardDescription>SLA compliance for completed permits</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">SLA Compliance Rate</span>
                  <span className="text-sm font-bold">{metrics.slaComplianceRate}%</span>
                </div>
                <Progress 
                  value={metrics.slaComplianceRate} 
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
                  <Timer className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-medium">Average Resolution Time</span>
                </div>
                <p className="text-2xl font-bold mt-2">{metrics.averageResolutionHours} hours</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Breached & At Risk Permits Lists */}
      <motion.div variants={itemVariants} className="grid lg:grid-cols-2 gap-6">
        {/* Breached Permits */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" />
              SLA Breaches
            </CardTitle>
            <CardDescription>
              {breachedPermits.length} permit{breachedPermits.length !== 1 ? 's' : ''} exceeded deadline
            </CardDescription>
          </CardHeader>
          <CardContent>
            {breachedPermits.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-success/50" />
                <p>No SLA breaches! Great job.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {breachedPermits.map((permit) => (
                  <div
                    key={permit.id}
                    className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg cursor-pointer hover:bg-destructive/10 transition-colors"
                    onClick={() => navigate(`/permits/${permit.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{permit.permit_no}</p>
                          {permit.urgency === 'urgent' && (
                            <Badge variant="destructive" className="text-xs">URGENT</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {permit.requester_name} • {permit.work_types?.name || 'General'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-destructive">+{permit.hoursOverdue}h</p>
                        <p className="text-xs text-muted-foreground">overdue</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <StatusBadge status={permit.status as any} />
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* At Risk Permits */}
        <Card className="border-warning/30">
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              At Risk
            </CardTitle>
            <CardDescription>
              {atRiskPermits.length} permit{atRiskPermits.length !== 1 ? 's' : ''} approaching deadline
            </CardDescription>
          </CardHeader>
          <CardContent>
            {atRiskPermits.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                <p>No permits at risk currently.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {atRiskPermits.map((permit) => (
                  <div
                    key={permit.id}
                    className="p-3 bg-warning/5 border border-warning/20 rounded-lg cursor-pointer hover:bg-warning/10 transition-colors"
                    onClick={() => navigate(`/permits/${permit.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{permit.permit_no}</p>
                          {permit.urgency === 'urgent' && (
                            <Badge variant="destructive" className="text-xs">URGENT</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {permit.requester_name} • {permit.work_types?.name || 'General'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-warning">{Math.abs(permit.hoursOverdue)}h</p>
                        <p className="text-xs text-muted-foreground">remaining</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <StatusBadge status={permit.status as any} />
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}