import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePendingPermitsForApprover, useSecureApprovePermit, WorkPermit } from '@/hooks/useWorkPermits';
import { useAuth } from '@/contexts/AuthContext';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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

// Role resolution for permit approval in this inbox:
//
// usePendingPermitsForApprover already filters permit_active_approvers
// to roles the user holds. So any permit appearing in the inbox has
// AT LEAST ONE active approver role matching the user's roles. For
// approve/reject, we just need to identify WHICH role the user is
// acting as (used as audit metadata + edge function's permit_approvals
// upsert key).
//
// Strategy: when the user clicks approve on a permit, look up the
// permit's active approver row(s) and intersect with user's roles.
// First match wins. Falls back to first user role if (impossibly) no
// match — the edge function validates anyway and will reject.
async function resolveApprovalRole(
  permitId: string,
  userRoles: string[],
): Promise<string> {
  try {
    const { data } = await supabase
      .from('permit_active_approvers' as any)
      .select('role_name, step_order')
      .eq('permit_id', permitId)
      .order('step_order', { ascending: true, nullsFirst: false });

    const activeRoleNames = ((data ?? []) as unknown as Array<{ role_name: string }>)
      .map((r) => r.role_name)
      .filter(Boolean);

    const match = userRoles.find((r) => activeRoleNames.includes(r));
    if (match) return match;
  } catch (e) {
    console.error('resolveApprovalRole failed; falling back', e);
  }

  // Defensive fallback. Picks the first non-tenant role the user has.
  // The edge function (verify-signature-approval) validates anyway.
  return userRoles.find((r) => r !== 'tenant') || 'helpdesk';
}

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproveDialogOpen, setBulkApproveDialogOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

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

  const getSLAStatus = (permit: WorkPermit) => {
    if (!permit.sla_deadline) return null;
    const deadline = parseISO(permit.sla_deadline);
    const isOverdue = isPast(deadline);
    const timeLeft = formatDistanceToNow(deadline, { addSuffix: true });
    return { isOverdue, timeLeft, deadline };
  };

  // Resolve the approval role for a permit by querying the view —
  // works for custom roles too (replaces the hardcoded statusToRole
  // map that didn't include al_hamra_customer_service and similar).
  const getApprovalRole = (permit: WorkPermit): Promise<string> =>
    resolveApprovalRole(permit.id, roles as string[]);

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = filteredPermits.length > 0 && filteredPermits.every(p => selectedIds.has(p.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredPermits.map(p => p.id)));
  };

  const handleBulkApprove = async (auth: AuthPayload, signature: string | null) => {
    const targets = filteredPermits.filter(p => selectedIds.has(p.id));
    setBulkProgress({ done: 0, total: targets.length });
    let success = 0;
    let failed = 0;
    for (const permit of targets) {
      try {
        // Resolve the role per-permit. Different permits can have
        // different active roles (a user may hold multiple approver
        // roles spread across different workflows).
        const role = await getApprovalRole(permit);
        await secureApprove.mutateAsync({
          permitId: permit.id,
          role,
          approved: true,
          auth,
          signature,
          comments: '',
        });
        success++;
      } catch (e) {
        console.error('Bulk approve failed for', permit.permit_no, e);
        failed++;
      }
      setBulkProgress(prev => prev ? { ...prev, done: prev.done + 1 } : prev);
    }
    setBulkProgress(null);
    setBulkApproveDialogOpen(false);
    setSelectedIds(new Set());
    if (failed === 0) toast.success(`Approved ${success} permit${success !== 1 ? 's' : ''}`);
    else toast.warning(`Approved ${success}, failed ${failed}`);
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

    const role = await getApprovalRole(selectedPermit);

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

    const role = await getApprovalRole(selectedPermit);

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
          {/* Bulk action bar */}
          <div className="flex items-center justify-between gap-3 px-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
              <span className="text-muted-foreground">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
              </span>
            </label>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-success text-success-foreground hover:bg-success/90"
                  onClick={() => setBulkApproveDialogOpen(true)}
                  disabled={secureApprove.isPending}
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve {selectedIds.size}
                </Button>
              </div>
            )}
          </div>

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
                      {/* Selection checkbox */}
                      <div
                        className="pt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedIds.has(permit.id)}
                          onCheckedChange={() => toggleSelected(permit.id)}
                          aria-label={`Select ${permit.permit_no}`}
                        />
                      </div>
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
                          {slaStatus?.isOverdue && (
                            <Badge variant="outline" className="text-destructive border-destructive flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {t('approverInbox.slaBreachedBadge')}
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
          // Display-only role for the dialog header / WebAuthn challenge.
          // Actual approval uses the awaited resolveApprovalRole in
          // handleSecureApproval which picks the correct role from
          // permit_active_approvers.
          role: (roles.find((r) => r !== 'tenant') as string) || 'helpdesk',
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
          // See note on the approve dialog binding above.
          role: (roles.find((r) => r !== 'tenant') as string) || 'helpdesk',
        } : { role: 'helpdesk' }}
      />

      <SecureApprovalDialog
        isOpen={bulkApproveDialogOpen}
        onClose={() => !bulkProgress && setBulkApproveDialogOpen(false)}
        onConfirm={handleBulkApprove}
        title={`Bulk Approve ${selectedIds.size} Permit${selectedIds.size !== 1 ? 's' : ''}`}
        description={
          bulkProgress
            ? `Approving ${bulkProgress.done} of ${bulkProgress.total}...`
            : 'Authenticate once to approve all selected permits with the same signature.'
        }
        actionType="approve"
        isLoading={secureApprove.isPending || !!bulkProgress}
        authBinding={{ role: 'helpdesk' }}
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
