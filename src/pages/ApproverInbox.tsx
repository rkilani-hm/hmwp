import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePendingPermitsForApprover, useSecureApprovePermit, WorkPermit } from '@/hooks/useWorkPermits';
import { useAuth } from '@/contexts/AuthContext';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PermitListSkeleton } from '@/components/ui/PermitListSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
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
  RefreshCw,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow, isPast, parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { SecureApprovalDialog } from '@/components/SecureApprovalDialog';
import type { AuthPayload } from '@/components/SecureApprovalDialog';
import { ReworkDialog } from '@/components/ReworkDialog';
import { ForwardPermitDialog } from '@/components/ForwardPermitDialog';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { useIsMobile } from '@/hooks/use-mobile';

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { roles, profile, user, refreshProfile } = useAuth();
  const { data: permits, isLoading } = usePendingPermitsForApprover();
  const authPreference = profile?.auth_preference || 'password';
  const secureApprove = useSecureApprovePermit();
  const [searchTerm, setSearchTerm] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [isToggling, setIsToggling] = useState(false);
  
  // Biometric support check
  const { isSupported: biometricSupported, isChecking: checkingBiometric } = useBiometricAuth();
  const isMobile = useIsMobile();
  const canUseBiometric = isMobile && biometricSupported && !checkingBiometric;
  
  // Dialog states
  const [selectedPermit, setSelectedPermit] = useState<WorkPermit | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reworkDialogOpen, setReworkDialogOpen] = useState(false);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);

  const toggleAuthPreference = async () => {
    if (!user?.id || isToggling) return;
    
    const newPreference = authPreference === 'password' ? 'biometric' : 'password';
    
    // Don't allow switching to biometric if not supported
    if (newPreference === 'biometric' && !canUseBiometric) {
      toast.error('Biometric authentication not available on this device');
      return;
    }
    
    setIsToggling(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ auth_preference: newPreference })
        .eq('id', user.id);
      
      if (error) throw error;
      
      await refreshProfile();
      toast.success(`Switched to ${newPreference === 'biometric' ? 'Fingerprint / Face ID' : 'Password'} authentication`);
    } catch (error) {
      console.error('Error updating auth preference:', error);
      toast.error('Failed to update preference');
    } finally {
      setIsToggling(false);
    }
  };

  const filteredPermits = (permits || []).filter(permit => {
    const matchesSearch = 
      permit.permit_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      permit.contractor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      permit.work_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      permit.unit.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesUrgency = urgencyFilter === 'all' || permit.urgency === urgencyFilter;
    
    return matchesSearch && matchesUrgency;
  });

  // Sort by SLA priority: overdue first (most overdue at top), then
  // about-to-breach (less than 2 hrs left), then by deadline ascending
  // (soonest deadline next), then permits with no deadline last.
  // This is the order an approver should work in if they have no
  // other prioritization signal.
  const sortedPermits = useMemo(() => {
    return [...filteredPermits].sort((a, b) => {
      const ad = a.sla_deadline ? new Date(a.sla_deadline).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.sla_deadline ? new Date(b.sla_deadline).getTime() : Number.POSITIVE_INFINITY;
      return ad - bd;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredPermits]);

  // Classify a permit's SLA urgency for the row badge.
  // - 'breach' : already past sla_deadline
  // - 'imminent' : less than 2 hours remaining
  // - 'soon' : less than 24 hours remaining
  // - 'normal' : more than 24 hours away (no badge)
  // - 'none' : no SLA deadline set
  const getSLAUrgency = (permit: WorkPermit): 'breach' | 'imminent' | 'soon' | 'normal' | 'none' => {
    if (!permit.sla_deadline) return 'none';
    const deadline = parseISO(permit.sla_deadline);
    if (isPast(deadline)) return 'breach';
    const hoursLeft = (deadline.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursLeft <= 2) return 'imminent';
    if (hoursLeft <= 24) return 'soon';
    return 'normal';
  };

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

  const handleSecureApproval = async (auth: AuthPayload, signature: string | null) => {
    if (!selectedPermit) return;
    
    const role = getApprovalRole(selectedPermit);
    
    try {
      await secureApprove.mutateAsync({
        permitId: selectedPermit.id,
        role,
        approved: true,
        auth,
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

  const handleSecureReject = async (auth: AuthPayload, signature: string | null) => {
    if (!selectedPermit) return;
    
    const role = getApprovalRole(selectedPermit);
    
    try {
      await secureApprove.mutateAsync({
        permitId: selectedPermit.id,
        role,
        approved: false,
        auth,
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
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Inbox className="w-7 h-7" />
              {t('approverInbox.title')}
            </h1>
          </div>
        </div>
        <PermitListSkeleton count={3} />
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
            {t('approverInbox.title')}
          </h1>
          <p className="text-muted-foreground">
            {filteredPermits.length} permit{filteredPermits.length !== 1 ? 's' : ''} awaiting your review
          </p>
        </div>
        
        {/* Auth Preference Quick Toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAuthPreference}
                disabled={isToggling || (authPreference === 'password' && !canUseBiometric)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 h-auto transition-colors",
                  authPreference === 'biometric' 
                    ? "border-primary/30 bg-primary/5 hover:bg-primary/10" 
                    : "border-muted-foreground/20 bg-muted/30"
                )}
              >
                {isToggling ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : authPreference === 'biometric' ? (
                  <Fingerprint className="w-4 h-4 text-primary" />
                ) : (
                  <KeyRound className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {authPreference === 'biometric' ? 'Biometric' : 'Password'}
                </span>
                <RefreshCw className={cn(
                  "w-3.5 h-3.5 text-muted-foreground",
                  isToggling && "animate-spin"
                )} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Current: {authPreference === 'biometric' ? 'Fingerprint / Face ID' : 'Password'}</p>
              <p className="text-xs text-muted-foreground">
                {authPreference === 'password' && !canUseBiometric 
                  ? 'Biometric not available on this device'
                  : 'Click to switch'}
              </p>
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
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Urgencies</SelectItem>
                <SelectItem value="urgent">Urgent Only</SelectItem>
                <SelectItem value="normal">Normal Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
            <Timer className="w-3 h-3" />
            Sorted by SLA priority (soonest deadlines first)
          </p>
        </CardContent>
      </Card>

      {/* Permits List */}
      {filteredPermits.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t('approverInbox.emptyTitle')}
          description={t('approverInbox.emptyHint')}
        />
      ) : (
        <div className="space-y-4">
          {sortedPermits.map((permit, index) => {
            const slaStatus = getSLAStatus(permit);
            const slaUrgency = getSLAUrgency(permit);

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
                    slaUrgency === 'breach' && "bg-destructive/5 border-destructive/40",
                    slaUrgency === 'imminent' && "ring-2 ring-destructive/40 animate-pulse",
                    slaUrgency === 'soon' && "border-warning/40",
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
                              {t('approverInbox.urgentBadge')}
                            </Badge>
                          )}
                          {slaUrgency === 'breach' && (
                            <Badge variant="destructive" className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              SLA BREACHED
                            </Badge>
                          )}
                          {slaUrgency === 'imminent' && (
                            <Badge
                              variant="outline"
                              className="text-destructive border-destructive bg-destructive/10 flex items-center gap-1 font-semibold"
                            >
                              <Timer className="w-3 h-3" />
                              &lt; 2 hours left
                            </Badge>
                          )}
                          {slaUrgency === 'soon' && (
                            <Badge
                              variant="outline"
                              className="text-warning border-warning bg-warning/10 flex items-center gap-1"
                            >
                              <Timer className="w-3 h-3" />
                              &lt; 24 hours
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
                      <div className="flex flex-col sm:items-end gap-3">
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
                                {slaStatus.isOverdue ? t('approverInbox.overdue') : t('approverInbox.due')}
                              </p>
                              <p className="text-sm font-semibold">
                                {slaStatus.timeLeft}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={(e) => handleForwardClick(e, permit)}
                          >
                            <Forward className="w-4 h-4" />
                            {t('approverInbox.forward')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={(e) => handleReworkClick(e, permit)}
                          >
                            <RotateCcw className="w-4 h-4" />
                            {t('approverInbox.rework')}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1.5"
                            onClick={(e) => handleRejectClick(e, permit)}
                          >
                            <XCircle className="w-4 h-4" />
                            {t('permits.approve.rejectButton')}
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1.5 bg-success text-success-foreground hover:bg-success/90"
                            onClick={(e) => handleApproveClick(e, permit)}
                          >
                            <CheckCircle className="w-4 h-4" />
                            {t('permits.approve.approveButton')}
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
                            {t('common.view')}
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
        authBinding={selectedPermit ? {
          permitId: selectedPermit.id,
          role: getApprovalRole(selectedPermit),
        } : { role: 'helpdesk' }}
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
        authBinding={selectedPermit ? {
          permitId: selectedPermit.id,
          role: getApprovalRole(selectedPermit),
        } : { role: 'helpdesk' }}
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
