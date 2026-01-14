import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePendingPermitsForApprover, useSecureApprovePermit, WorkPermit } from '@/hooks/useWorkPermits';
import { useAuth } from '@/contexts/AuthContext';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Inbox,
  Search,
  Clock,
  AlertTriangle,
  Eye,
  Loader2,
  Timer,
  Building2,
  Calendar,
  CheckCircle,
  XCircle,
  RotateCcw,
  Forward,
  Fingerprint,
  KeyRound,
  Settings,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow, isPast, parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { SecureApprovalDialog } from '@/components/SecureApprovalDialog';
import { ReworkDialog } from '@/components/ReworkDialog';
import { ForwardPermitDialog } from '@/components/ForwardPermitDialog';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Map permit status to the role that should approve it (dynamically generated)
const statusToRole: Record<string, string> = {
  // Legacy internal workflow
  'pending_helpdesk': 'helpdesk',
  'under_review': 'helpdesk',
  'submitted': 'helpdesk',
  'pending_pm': 'pm',
  'pending_pd': 'pd',
  'pending_bdcr': 'bdcr',
  'pending_mpr': 'mpr',
  'pending_it': 'it',
  'pending_fitout': 'fitout',
  'pending_ecovert_supervisor': 'ecovert_supervisor',
  'pending_pmd_coordinator': 'pmd_coordinator',
  // Client workflow roles
  'pending_customer_service': 'customer_service',
  'pending_cr_coordinator': 'cr_coordinator',
  'pending_head_cr': 'head_cr',
  'pending_fmsp_approval': 'fmsp_approval',
  // Soft/Hard Facilities and PM Service
  'pending_soft_facilities': 'soft_facilities',
  'pending_hard_facilities': 'hard_facilities',
  'pending_pm_service': 'pm_service',
};

export default function ApproverInbox() {
  const navigate = useNavigate();
  const { roles, profile } = useAuth();
  const { data: permits, isLoading } = usePendingPermitsForApprover();
  const authPreference = profile?.auth_preference || 'password';
  const secureApprove = useSecureApprovePermit();
  const [searchTerm, setSearchTerm] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  
  // Dialog states
  const [selectedPermit, setSelectedPermit] = useState<WorkPermit | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reworkDialogOpen, setReworkDialogOpen] = useState(false);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);

  const filteredPermits = (permits || []).filter(permit => {
    const matchesSearch = 
      permit.permit_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      permit.contractor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      permit.work_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      permit.unit.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesUrgency = urgencyFilter === 'all' || permit.urgency === urgencyFilter;
    
    return matchesSearch && matchesUrgency;
  });

  const getSLAStatus = (permit: WorkPermit) => {
    if (!permit.sla_deadline) return null;
    const deadline = parseISO(permit.sla_deadline);
    const isOverdue = isPast(deadline);
    const timeLeft = formatDistanceToNow(deadline, { addSuffix: true });
    return { isOverdue, timeLeft, deadline };
  };

  // Get the current approver role based on permit status
  const getApprovalRole = (permit: WorkPermit): string => {
    const roleFromStatus = statusToRole[permit.status];
    if (roleFromStatus && roles.includes(roleFromStatus as any)) {
      return roleFromStatus;
    }
    // Fallback: return the first matching approver role the user has
    const allApproverRoles = Object.values(statusToRole);
    return roles.find(r => allApproverRoles.includes(r)) || 'helpdesk';
  };

  const handleApproveClick = (e: React.MouseEvent, permit: WorkPermit) => {
    e.stopPropagation();
    setSelectedPermit(permit);
    setApprovalDialogOpen(true);
  };

  const handleRejectClick = (e: React.MouseEvent, permit: WorkPermit) => {
    e.stopPropagation();
    setSelectedPermit(permit);
    setRejectDialogOpen(true);
  };

  const handleReworkClick = (e: React.MouseEvent, permit: WorkPermit) => {
    e.stopPropagation();
    setSelectedPermit(permit);
    setReworkDialogOpen(true);
  };

  const handleForwardClick = (e: React.MouseEvent, permit: WorkPermit) => {
    e.stopPropagation();
    setSelectedPermit(permit);
    setForwardDialogOpen(true);
  };

  const handleSecureApproval = async (password: string, signature: string) => {
    if (!selectedPermit) return;
    
    const role = getApprovalRole(selectedPermit);
    
    try {
      await secureApprove.mutateAsync({
        permitId: selectedPermit.id,
        role,
        approved: true,
        password,
        signature,
        comments: '',
      });
      setApprovalDialogOpen(false);
      setSelectedPermit(null);
      toast.success('Permit approved successfully');
    } catch (error) {
      console.error('Approval error:', error);
      throw error;
    }
  };

  const handleSecureReject = async (password: string, signature: string) => {
    if (!selectedPermit) return;
    
    const role = getApprovalRole(selectedPermit);
    
    try {
      await secureApprove.mutateAsync({
        permitId: selectedPermit.id,
        role,
        approved: false,
        password,
        signature: null,
        comments: 'Rejected from approver inbox',
      });
      setRejectDialogOpen(false);
      setSelectedPermit(null);
      toast.success('Permit rejected');
    } catch (error) {
      console.error('Rejection error:', error);
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Inbox className="w-7 h-7" />
            Approver Inbox
          </h1>
          <p className="text-muted-foreground">
            {filteredPermits.length} permit{filteredPermits.length !== 1 ? 's' : ''} awaiting your review
          </p>
        </div>
        
        {/* Auth Preference Indicator */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link 
                to="/settings" 
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors hover:bg-muted/50",
                  authPreference === 'biometric' 
                    ? "border-primary/30 bg-primary/5" 
                    : "border-muted-foreground/20 bg-muted/30"
                )}
              >
                {authPreference === 'biometric' ? (
                  <Fingerprint className="w-4 h-4 text-primary" />
                ) : (
                  <KeyRound className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {authPreference === 'biometric' ? 'Biometric' : 'Password'}
                </span>
                <Settings className="w-3.5 h-3.5 text-muted-foreground" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>
              <p>Default authentication: {authPreference === 'biometric' ? 'Fingerprint / Face ID' : 'Password'}</p>
              <p className="text-xs text-muted-foreground">Click to change in settings</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search permits..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Urgencies</SelectItem>
                <SelectItem value="urgent">Urgent Only</SelectItem>
                <SelectItem value="normal">Normal Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Permits List */}
      {filteredPermits.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No pending approvals</h3>
            <p className="text-muted-foreground text-center max-w-md">
              You're all caught up! There are no work permits waiting for your review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredPermits.map((permit, index) => {
            const slaStatus = getSLAStatus(permit);
            
            return (
              <motion.div
                key={permit.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card 
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    permit.urgency === 'urgent' && "border-l-4 border-l-destructive",
                    slaStatus?.isOverdue && "bg-destructive/5"
                  )}
                  onClick={() => navigate(`/permits/${permit.id}`)}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      {/* Main Info */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-semibold text-lg">{permit.permit_no}</h3>
                          <StatusBadge status={permit.status as any} />
                          {permit.urgency === 'urgent' && (
                            <Badge variant="destructive" className="flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              URGENT
                            </Badge>
                          )}
                          {slaStatus?.isOverdue && (
                            <Badge variant="outline" className="text-destructive border-destructive flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              SLA BREACHED
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {permit.work_description}
                        </p>
                        
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            {permit.contractor_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(permit.work_date_from), 'MMM d, yyyy')}
                          </span>
                          <span>Unit: {permit.unit}, Floor: {permit.floor}</span>
                        </div>
                      </div>

                      {/* Right Side - SLA Timer and Actions */}
                      <div className="flex flex-col items-end gap-3">
                        {slaStatus && (
                          <div className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg",
                            slaStatus.isOverdue 
                              ? "bg-destructive/10 text-destructive" 
                              : "bg-muted"
                          )}>
                            <Timer className="w-4 h-4" />
                            <div className="text-right">
                              <p className="text-xs font-medium">
                                {slaStatus.isOverdue ? 'Overdue' : 'Due'}
                              </p>
                              <p className="text-sm font-semibold">
                                {slaStatus.timeLeft}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={(e) => handleForwardClick(e, permit)}
                          >
                            <Forward className="w-4 h-4" />
                            Forward
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={(e) => handleReworkClick(e, permit)}
                          >
                            <RotateCcw className="w-4 h-4" />
                            Rework
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => handleRejectClick(e, permit)}
                          >
                            <XCircle className="w-4 h-4" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                            onClick={(e) => handleApproveClick(e, permit)}
                          >
                            <CheckCircle className="w-4 h-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/permits/${permit.id}`);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Stats Summary */}
      {filteredPermits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{filteredPermits.length}</p>
                <p className="text-sm text-muted-foreground">Total Pending</p>
              </div>
              <div className="text-center p-4 bg-destructive/10 rounded-lg">
                <p className="text-2xl font-bold text-destructive">
                  {filteredPermits.filter(p => p.urgency === 'urgent').length}
                </p>
                <p className="text-sm text-muted-foreground">Urgent</p>
              </div>
              <div className="text-center p-4 bg-destructive/10 rounded-lg">
                <p className="text-2xl font-bold text-destructive">
                  {filteredPermits.filter(p => p.sla_breached).length}
                </p>
                <p className="text-sm text-muted-foreground">SLA Breached</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">
                  {filteredPermits.filter(p => p.sla_deadline && !isPast(parseISO(p.sla_deadline))).length}
                </p>
                <p className="text-sm text-muted-foreground">On Track</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <SecureApprovalDialog
        isOpen={approvalDialogOpen}
        onClose={() => {
          setApprovalDialogOpen(false);
          setSelectedPermit(null);
        }}
        onConfirm={handleSecureApproval}
        title="Approve Work Permit"
        description="Enter your password and signature to approve this permit."
        actionType="approve"
        isLoading={secureApprove.isPending}
      />

      <SecureApprovalDialog
        isOpen={rejectDialogOpen}
        onClose={() => {
          setRejectDialogOpen(false);
          setSelectedPermit(null);
        }}
        onConfirm={handleSecureReject}
        title="Reject Work Permit"
        description="Enter your password to confirm rejection."
        actionType="reject"
        isLoading={secureApprove.isPending}
      />

      {selectedPermit && (
        <ReworkDialog
          open={reworkDialogOpen}
          onOpenChange={(open) => {
            setReworkDialogOpen(open);
            if (!open) setSelectedPermit(null);
          }}
          permitId={selectedPermit.id}
        />
      )}

      {selectedPermit && (
        <ForwardPermitDialog
          open={forwardDialogOpen}
          onOpenChange={(open) => {
            setForwardDialogOpen(open);
            if (!open) setSelectedPermit(null);
          }}
          permitId={selectedPermit.id}
          currentStatus={selectedPermit.status}
        />
      )}
    </div>
  );
}
