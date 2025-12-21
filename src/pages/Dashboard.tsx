import { StatsCard } from '@/components/ui/StatsCard';
import { PermitCard } from '@/components/PermitCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkPermits, usePermitStats, WorkPermit } from '@/hooks/useWorkPermits';
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

type UserRole = 'contractor' | 'helpdesk' | 'pm' | 'pd' | 'bdcr' | 'mpr' | 'it' | 'fitout' | 'soft_facilities' | 'hard_facilities' | 'pm_service' | 'admin';

const roleLabels: Record<UserRole, string> = {
  contractor: 'Contractor',
  helpdesk: 'Helpdesk',
  pm: 'Property Management',
  pd: 'Project Development',
  bdcr: 'BDCR',
  mpr: 'MPR',
  it: 'IT Department',
  fitout: 'Fit-Out',
  soft_facilities: 'Soft Facilities',
  hard_facilities: 'Hard Facilities',
  pm_service: 'PM Service Provider',
  admin: 'Administrator',
};

interface DashboardProps {
  currentRole: UserRole;
}

// Helper to convert database permit to legacy format for PermitCard
const toPermitCardFormat = (permit: WorkPermit) => ({
  id: permit.id,
  permitNo: permit.permit_no,
  status: permit.status as any,
  requesterName: permit.requester_name,
  requesterEmail: permit.requester_email,
  contractorName: permit.contractor_name,
  unit: permit.unit,
  floor: permit.floor,
  contactMobile: permit.contact_mobile,
  workDescription: permit.work_description,
  workLocation: permit.work_location,
  workDateFrom: permit.work_date_from,
  workDateTo: permit.work_date_to,
  workTimeFrom: permit.work_time_from,
  workTimeTo: permit.work_time_to,
  attachments: permit.attachments || [],
  workTypeId: permit.work_type_id || '',
  workTypeName: permit.work_types?.name,
  helpdeskApproval: { status: permit.helpdesk_status as any, approverName: permit.helpdesk_approver_name, approverEmail: null, date: permit.helpdesk_date, comments: permit.helpdesk_comments, signature: permit.helpdesk_signature },
  pmApproval: { status: permit.pm_status as any, approverName: permit.pm_approver_name, approverEmail: null, date: permit.pm_date, comments: permit.pm_comments, signature: permit.pm_signature },
  pdApproval: { status: permit.pd_status as any, approverName: permit.pd_approver_name, approverEmail: null, date: permit.pd_date, comments: permit.pd_comments, signature: permit.pd_signature },
  bdcrApproval: { status: null, approverName: null, approverEmail: null, date: null, comments: null, signature: null },
  mprApproval: { status: null, approverName: null, approverEmail: null, date: null, comments: null, signature: null },
  itApproval: { status: null, approverName: null, approverEmail: null, date: null, comments: null, signature: null },
  fitoutApproval: { status: null, approverName: null, approverEmail: null, date: null, comments: null, signature: null },
  softFacilitiesApproval: { status: null, approverName: null, approverEmail: null, date: null, comments: null, signature: null },
  hardFacilitiesApproval: { status: null, approverName: null, approverEmail: null, date: null, comments: null, signature: null },
  pmServiceApproval: { status: null, approverName: null, approverEmail: null, date: null, comments: null, signature: null },
  closingRemarks: null,
  closingCleanConfirmed: false,
  closingIncidents: null,
  closedBy: null,
  closedDate: null,
  pdfUrl: permit.pdf_url,
  createdAt: permit.created_at,
  updatedAt: permit.updated_at,
});

export default function Dashboard({ currentRole }: DashboardProps) {
  const navigate = useNavigate();
  const { data: permits, isLoading } = useWorkPermits();
  const stats = usePermitStats();
  
  const recentPermits = permits?.slice(0, 4) || [];
  const pendingPermits = permits?.filter(
    (p) => p.status.startsWith('pending') || p.status === 'submitted' || p.status === 'under_review'
  ).slice(0, 3) || [];

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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
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
            You're viewing as <span className="font-medium text-foreground">{roleLabels[currentRole]}</span>
          </p>
        </div>
        <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to="/new-permit">
            <Plus className="w-4 h-4 mr-2" />
            New Permit Request
          </Link>
        </Button>
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard
          title="Total Permits"
          value={stats.total}
          icon={FileText}
          variant="primary"
          href="/permits"
        />
        <StatsCard
          title="Pending"
          value={stats.pending}
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
        <StatsCard
          title="Rejected"
          value={stats.rejected}
          icon={XCircle}
          variant="destructive"
          href="/permits?status=rejected"
        />
        <StatsCard
          title="Closed"
          value={stats.closed}
          icon={Archive}
          variant="default"
          href="/permits?status=closed"
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
              {recentPermits.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No permits yet</p>
              ) : (
                recentPermits.map((permit) => (
                  <PermitCard
                    key={permit.id}
                    permit={toPermitCardFormat(permit)}
                    onClick={() => navigate(`/permits/${permit.id}`)}
                  />
                ))
              )}
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
                      <p className="font-medium text-sm truncate">{permit.permit_no}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {permit.contractor_name}
                      </p>
                    </div>
                    <StatusBadge status={permit.status as any} />
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
                  <span className="text-sm font-medium">{stats.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Completed</span>
                  <span className="text-sm font-medium">{stats.approved + stats.closed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">In Progress</span>
                  <span className="text-sm font-medium">{stats.pending}</span>
                </div>
                <div className="h-px bg-border my-2" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Approval Rate</span>
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
