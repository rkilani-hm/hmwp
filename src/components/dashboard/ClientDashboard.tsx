import { StatsCard } from '@/components/ui/StatsCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PermitProgressTracker } from '@/components/ui/PermitProgressTracker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkPermits, usePermitStats } from '@/hooks/useWorkPermits';
import {
  FileText,
  Clock,
  CheckCircle,
  Plus,
  ArrowRight,
  Activity,
  Send,
  RotateCcw,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

export function ClientDashboard() {
  const navigate = useNavigate();
  const { data: permits, isLoading } = useWorkPermits();
  const stats = usePermitStats();

  // Get pending permits (waiting for approval)
  const pendingPermits = permits?.filter(
    (p) => p.status.startsWith('pending') || p.status === 'submitted' || p.status === 'under_review'
  ) || [];

  // Get rework needed permits
  const reworkPermits = permits?.filter((p) => p.status === 'rework_needed') || [];

  // Get recent activity (last 5 permits sorted by updated_at)
  const recentActivity = permits?.slice(0, 5) || [];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">
            Welcome back
          </h1>
          <p className="text-muted-foreground mt-1">
            Track your work permit requests and their approval status
          </p>
        </div>
        <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to="/new-permit">
            <Plus className="w-4 h-4 mr-2" />
            New Permit Request
          </Link>
        </Button>
      </motion.div>

      {/* Stats Grid - Focused on client needs */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard
          title="Total Submitted"
          value={stats.total}
          icon={Send}
          variant="primary"
          href="/permits"
        />
        <StatsCard
          title="Pending Approval"
          value={pendingPermits.length}
          icon={Clock}
          variant="warning"
          href="/permits?status=pending"
        />
        <StatsCard
          title="Approved"
          value={stats.approved}
          icon={CheckCircle}
          variant="success"
          href="/permits?status=approved"
        />
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Pending & Rework Permits */}
        <motion.div variants={itemVariants} className="lg:col-span-2 space-y-6">
          {/* Rework Needed Section */}
          {reworkPermits.length > 0 && (
            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-orange-500" />
                  Rework Needed
                </CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/permits?status=rework_needed" className="text-orange-600">
                    View all
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {reworkPermits.slice(0, 3).map((permit) => (
                  <div
                    key={permit.id}
                    className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800/50 cursor-pointer hover:border-orange-400 transition-colors"
                    onClick={() => navigate(`/permits/${permit.id}/edit`)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <p className="font-medium text-sm">{permit.permit_no}</p>
                        {permit.rework_version && permit.rework_version > 0 && (
                          <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium">
                            V{permit.rework_version + 1}
                          </span>
                        )}
                        <StatusBadge status={permit.status as any} />
                      </div>
                      <Button size="sm" variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-500 hover:text-white">
                        Edit & Resubmit
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {permit.work_description}
                    </p>
                    {permit.rework_comments && (
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-2 italic">
                        "{permit.rework_comments}"
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Pending Permits */}
          <Card className={pendingPermits.length > 0 ? "border-warning/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-warning" />
                Awaiting Approval
              </CardTitle>
              {pendingPermits.length > 0 && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/permits?status=pending" className="text-accent">
                    View all
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingPermits.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-success/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No pending permits</p>
                  <p className="text-sm text-muted-foreground mt-1">All your permits have been processed</p>
                </div>
              ) : (
                pendingPermits.slice(0, 4).map((permit) => (
                  <div
                    key={permit.id}
                    className="p-4 bg-muted/50 rounded-lg border cursor-pointer hover:border-accent/30 transition-colors"
                    onClick={() => navigate(`/permits/${permit.id}`)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <p className="font-medium text-sm">{permit.permit_no}</p>
                        <StatusBadge status={permit.status as any} />
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                    <p className="text-sm text-muted-foreground truncate mb-3">
                      {permit.work_description}
                    </p>
                    {/* Progress Tracker */}
                    <PermitProgressTracker permit={permit} compact />
                    <p className="text-xs text-muted-foreground mt-3">
                      Submitted {format(new Date(permit.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Sidebar */}
        <motion.div variants={itemVariants} className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                asChild
              >
                <Link to="/new-permit">
                  <Plus className="w-4 h-4 mr-2" />
                  Submit New Permit
                </Link>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                asChild
              >
                <Link to="/permits">
                  <FileText className="w-4 h-4 mr-2" />
                  View All My Permits
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-accent" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-muted-foreground text-center py-4 text-sm">No activity yet</p>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((permit) => (
                    <div
                      key={permit.id}
                      className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors -mx-2"
                      onClick={() => navigate(`/permits/${permit.id}`)}
                    >
                      <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{permit.permit_no}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(permit.updated_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                      <StatusBadge status={permit.status as any} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary Stats */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Submitted</span>
                  <span className="text-sm font-medium">{stats.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Approved</span>
                  <span className="text-sm font-medium text-success">{stats.approved}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Rejected</span>
                  <span className="text-sm font-medium text-destructive">{stats.rejected}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Closed</span>
                  <span className="text-sm font-medium">{stats.closed}</span>
                </div>
                <div className="h-px bg-border my-2" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Success Rate</span>
                  <span className="text-sm font-medium text-success">
                    {stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
