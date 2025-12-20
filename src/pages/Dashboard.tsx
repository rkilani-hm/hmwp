import { StatsCard } from '@/components/ui/StatsCard';
import { PermitCard } from '@/components/PermitCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { mockPermits, getStatsForRole } from '@/data/mockData';
import { UserRole, roleLabels, PermitStatus } from '@/types/workPermit';
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Archive,
  Plus,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

interface DashboardProps {
  currentRole: UserRole;
}

export default function Dashboard({ currentRole }: DashboardProps) {
  const navigate = useNavigate();
  const stats = getStatsForRole(currentRole);
  
  const recentPermits = mockPermits.slice(0, 4);
  const pendingPermits = mockPermits.filter(
    (p) => p.status.startsWith('pending') || p.status === 'submitted' || p.status === 'under_review'
  ).slice(0, 3);

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
            You're viewing as <span className="font-medium text-foreground">{roleLabels[currentRole]}</span>
          </p>
        </div>
        {currentRole === 'contractor' && (
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/new-permit">
              <Plus className="w-4 h-4 mr-2" />
              New Permit Request
            </Link>
          </Button>
        )}
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard
          title="Total Permits"
          value={stats.total}
          icon={FileText}
          variant="primary"
        />
        <StatsCard
          title="Pending"
          value={stats.pending}
          icon={Clock}
          variant="warning"
        />
        <StatsCard
          title="Approved"
          value={stats.approved}
          icon={CheckCircle}
          variant="success"
        />
        <StatsCard
          title="Rejected"
          value={stats.rejected}
          icon={XCircle}
          variant="destructive"
        />
        <StatsCard
          title="Closed"
          value={stats.closed}
          icon={Archive}
          variant="default"
        />
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="font-display text-lg">Recent Permits</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/permits" className="text-accent">
                  View all
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentPermits.map((permit) => (
                <PermitCard
                  key={permit.id}
                  permit={permit}
                  onClick={() => navigate(`/permits/${permit.id}`)}
                />
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Actions & Pending */}
        <motion.div variants={itemVariants} className="space-y-6">
          {/* Quick Actions */}
          {currentRole === 'contractor' && (
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
                    View My Permits
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Pending Approvals */}
          {currentRole !== 'contractor' && pendingPermits.length > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardHeader className="pb-4">
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-warning" />
                  Pending Approvals
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingPermits.map((permit) => (
                  <div
                    key={permit.id}
                    className="flex items-center justify-between p-3 bg-card rounded-lg border cursor-pointer hover:border-accent/30 transition-colors"
                    onClick={() => navigate(`/permits/${permit.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{permit.permitNo}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {permit.contractorName}
                      </p>
                    </div>
                    <StatusBadge status={permit.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-accent" />
                This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Submitted</span>
                  <span className="text-sm font-medium">12</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Completed</span>
                  <span className="text-sm font-medium">8</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Avg. Processing</span>
                  <span className="text-sm font-medium">3.2 days</span>
                </div>
                <div className="h-px bg-border my-2" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Approval Rate</span>
                  <span className="text-sm font-medium text-success">92%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
