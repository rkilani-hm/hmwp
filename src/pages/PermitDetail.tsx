import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkPermit, useSecureApprovePermit } from '@/hooks/useWorkPermits';
import { usePermitActiveApprovers } from '@/hooks/usePermitActiveApprovers';
import { useArchiveWorkPermit, useRestoreWorkPermit, useHardDeleteWorkPermit } from '@/hooks/useDeleteWorkPermit';
import { AdminDeleteDialog } from '@/components/AdminDeleteDialog';
import { useGeneratePdf } from '@/hooks/useGeneratePdf';
import { useResendNotification } from '@/hooks/useResendNotification';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PermitApprovalProgress } from '@/components/PermitApprovalProgress';
import { SecureApprovalDialog } from '@/components/SecureApprovalDialog';
import type { AuthPayload } from '@/components/SecureApprovalDialog';
import { ForwardPermitDialog } from '@/components/ForwardPermitDialog';
import { ReworkDialog } from '@/components/ReworkDialog';
import { CancelPermitDialog } from '@/components/CancelPermitDialog';
import { PdfPreviewDialog } from '@/components/PdfPreviewDialog';
import { ModifyWorkflowDialog } from '@/components/ModifyWorkflowDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { PermitStatus } from '@/types/workPermit';
import { humanRoleName } from '@/utils/roleDisplay';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  MapPin,
  Phone,
  User,
  Mail,
  CheckCircle,
  XCircle,
  Download,
  Eye,
  Loader2,
  FileText,
  AlertTriangle,
  Timer,
  Forward,
  RotateCcw,
  Ban,
  Edit,
  Bell,
  Settings2,
  UserCheck,
  Users,
} from 'lucide-react';
import { PermitAttachmentsTab } from '@/components/permit-detail/PermitAttachmentsTab';
import { PermitVersionHistory } from '@/components/PermitVersionHistory';
import { PermitActivityLog } from '@/components/PermitActivityLog';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, isPast, parseISO } from 'date-fns';
import { usePermitAttachments } from '@/hooks/usePermitAttachments';

function ExpiredIdsBanner({ permitId }: { permitId: string }) {
  const { data: attachments } = usePermitAttachments(permitId);
  const expiredCount = attachments?.filter(
    (a) => a.extraction_status === 'success' && a.is_valid === false,
  ).length ?? 0;

  if (expiredCount === 0) return null;

  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 flex items-center gap-3 text-sm text-destructive">
      <AlertTriangle className="w-5 h-5 flex-shrink-0" />
      <span>
        <strong>Expired ID detected:</strong>{' '}
        {expiredCount} attached ID document{expiredCount === 1 ? ' has' : 's have'} expired.
        Please request updated documents before approving.
      </span>
    </div>
  );
}


interface PermitDetailProps {
  currentRole: string;
}

// Snake_case role name -> Title Case. Moved to src/utils/roleDisplay.ts
// so dashboards, badges, and approval-chain widgets share one
// implementation. Kept this import-style stub since several call sites
// in this file use the name 'humanRoleName' unqualified.

export default function PermitDetail({ currentRole }: PermitDetailProps) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles, user } = useAuth();
  const [comments, setComments] = useState('');
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [reworkDialogOpen, setReworkDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [modifyWorkflowOpen, setModifyWorkflowOpen] = useState(false);

  const { data: permit, isLoading, error } = useWorkPermit(id);
  const secureApprove = useSecureApprovePermit();
  // Drives both the "Currently with" inline display AND canApprove().
  // Single source of truth across the page, matching what the inbox
  // sees — eliminates the old hardcoded statusToRole map that didn't
  // include custom roles like al_hamra_customer_service.
  const { data: activeApprovers = [], isLoading: activeApproversLoading } = usePermitActiveApprovers(id);
  const { generatePdf, isGenerating } = useGeneratePdf();
  const resendNotification = useResendNotification();
  const archivePermit = useArchiveWorkPermit();
  const restorePermit = useRestoreWorkPermit();
  const hardDeletePermit = useHardDeleteWorkPermit();
  const isPermitArchived = (permit as any)?.is_archived;

  const isAdmin = roles.includes('admin');
  const isPendingStatus = (status: string) => 
    status.startsWith('pending_') || ['submitted', 'under_review'].includes(status);

  const handleGeneratePdf = async () => {
    if (!permit) return;
    const pdfUrl = await generatePdf(permit.id);
    if (pdfUrl) {
      // Refetch permit to get the updated pdf_url
      queryClient.invalidateQueries({ queryKey: ['work-permit', id] });
      // Open preview dialog with the generated PDF
      setPreviewPdfUrl(pdfUrl);
      setPdfPreviewOpen(true);
    }
  };

  const handlePreviewPdf = async () => {
    if (!permit) return;
    // Generate a fresh signed URL for preview
    const pdfUrl = await generatePdf(permit.id);
    if (pdfUrl) {
      setPreviewPdfUrl(pdfUrl);
      setPdfPreviewOpen(true);
    }
  };

  const handleDownloadPdf = () => {
    const url = previewPdfUrl || permit?.pdf_url;
    if (url && permit) {
      const link = document.createElement('a');
      link.href = url;
      link.download = `${permit.permit_no.replace(/\//g, '-')}.pdf`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !permit) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Permit not found</p>
      </div>
    );
  }

  const workType = permit.work_types;

  // canApprove: is the current user expected to act on this permit
  // RIGHT NOW? Reads from permit_active_approvers — same source as the
  // inbox, so the two stay in sync. A user holding any role found in
  // the active-approvers list can act. (Previous impl used a hardcoded
  // map of legacy status -> role names; broke for custom roles.)
  const canApprove = () => {
    if (currentRole === 'tenant') return false;
    if (activeApproversLoading) return false;
    if (activeApprovers.length === 0) return false;
    const activeRoleNames = new Set(activeApprovers.map((a) => a.role_name));
    return roles.some((r) => activeRoleNames.has(r as string));
  };

  // getApprovalRole: which OF the active roles is the current user
  // acting as? If user holds multiple matching roles, prefer the
  // earliest step_order (the most active one in the workflow). The
  // approve edge function then double-checks role assignment via RLS.
  const getApprovalRole = (): string => {
    const matchingActive = activeApprovers.filter((a) => roles.includes(a.role_name as any));
    if (matchingActive.length > 0) return matchingActive[0].role_name;
    // Fallback: any role the user has from the active list (defensive)
    const activeRoleNames = activeApprovers.map((a) => a.role_name);
    return roles.find((r) => activeRoleNames.includes(r as string)) || 'helpdesk';
  };

  const handleApprove = () => {
    setApprovalAction('approve');
    setApprovalDialogOpen(true);
  };

  const handleReject = () => {
    if (!comments) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    setApprovalAction('reject');
    setApprovalDialogOpen(true);
  };

  const handleSecureApproval = async (auth: AuthPayload, signature: string | null) => {
    await secureApprove.mutateAsync({
      permitId: permit.id,
      role: getApprovalRole(),
      comments,
      signature: approvalAction === 'approve' ? signature : null,
      approved: approvalAction === 'approve',
      auth,
    });
    setApprovalDialogOpen(false);
    setComments('');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 flex-wrap">
          <Button variant="ghost" size="icon" className="flex-shrink-0 mt-1" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold truncate">
                {permit.permit_no}
                {(permit as any).rework_version > 0 && (
                  <span className="text-base font-normal text-muted-foreground ml-2">
                    V{(permit as any).rework_version}
                  </span>
                )}
              </h1>
              <StatusBadge status={permit.status as PermitStatus} />
              {/* Workflow Modified Badge */}
              {(permit as any).workflow_customized && (
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                  <Settings2 className="h-3 w-3 mr-1" />
                  Modified
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-sm">{permit.work_types?.name || 'General Work'}</p>
            {/* Inline "currently with" indicator — visible to BOTH tenant
                (so they know who's holding their permit right now) and
                approvers (so they see who else acts in parallel). Reads
                permit_active_approvers; empty for terminal statuses. */}
            {activeApprovers.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap text-sm text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5 text-primary" />
                <span>Currently with:</span>
                {activeApprovers.map((a, idx) => (
                  <Badge key={a.role_id || idx} variant="outline" className="font-normal">
                    {humanRoleName(a.role_name)}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Approval action buttons — visible only to current approvers
              for the active workflow step. Mirrors the same Forward /
              Rework / Reject / Approve controls users see in
              /approver-inbox, with identical styling and the same
              dialogs/handlers. canApprove() reads permit_active_approvers
              so visibility is data-driven and stays in sync with the
              inbox query. Non-approvers see none of these.

              Rendered as a sibling of the title block so they sit at
              the top-right of the header on wide screens; wraps to a
              new row on narrow screens via flex-wrap on the parent. */}
          {canApprove() && (
            <div className="flex flex-wrap gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setForwardDialogOpen(true)}
                disabled={secureApprove.isPending}
              >
                <Forward className="w-4 h-4" />
                Forward
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setReworkDialogOpen(true)}
                disabled={secureApprove.isPending}
              >
                <RotateCcw className="w-4 h-4" />
                Rework
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                // Open the dialog directly — matches My Inbox behavior.
                // The inline Comments box (in the Approval card below)
                // is still used for the rejection reason if the user
                // typed one there; if empty, the dialog still confirms.
                onClick={() => {
                  setApprovalAction('reject');
                  setApprovalDialogOpen(true);
                }}
                disabled={secureApprove.isPending}
              >
                <XCircle className="w-4 h-4" />
                Reject
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-success text-success-foreground hover:bg-success/90"
                onClick={handleApprove}
                disabled={secureApprove.isPending}
              >
                <CheckCircle className="w-4 h-4" />
                Approve
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Edit button for rework_needed permits - only for creators */}
          {permit.requester_id === user?.id && permit.status === 'rework_needed' && (
            <Button 
              variant="default"
              size="sm"
              onClick={() => navigate(`/permits/${permit.id}/edit`)}
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit & Resubmit
            </Button>
          )}
          {/* Withdraw button for creators - only show for active permits. 
              "Withdraw" reads more naturally than "Cancel" for a tenant
              taking back their own submission. Internally still calls
              useCancelPermit → sets status='cancelled'; UI label only. */}
          {permit.requester_id === user?.id && 
           !['cancelled', 'rejected', 'closed', 'approved', 'rework_needed'].includes(permit.status) && (
            <Button 
              variant="outline" 
              size="sm"
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setCancelDialogOpen(true)}
            >
              <Ban className="w-4 h-4 mr-2" />
              Withdraw
            </Button>
          )}
          {/* Admin: Resend Notification button for pending permits */}
          {isAdmin && isPendingStatus(permit.status) && (
            <Button 
              variant="outline"
              size="sm"
              onClick={() => resendNotification.mutate(permit.id)}
              disabled={resendNotification.isPending}
            >
              {resendNotification.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Bell className="w-4 h-4 mr-2" />
              )}
              <span className="hidden sm:inline">Resend</span>
              <span className="sm:hidden">Notify</span>
            </Button>
          )}
          {!permit.pdf_url && (
            <Button 
              variant="default" 
              size="sm"
              onClick={handleGeneratePdf}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 mr-2" />
              )}
              <span className="hidden sm:inline">Generate PDF</span>
              <span className="sm:hidden">PDF</span>
            </Button>
          )}
          {/* Preview PDF — always available. Renders a fresh PDF on the fly
              and opens it in the in-app dialog so reviewers can verify the
              latest design (e.g. new section banners) without downloading. */}
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviewPdf}
            disabled={isGenerating}
            title="Render the latest PDF and open it in a preview dialog"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Eye className="w-4 h-4 mr-2" />
            )}
            <span className="hidden sm:inline">Preview PDF</span>
            <span className="sm:hidden">Preview</span>
          </Button>
          {isAdmin && !isPermitArchived && (
            <AdminDeleteDialog
              title="Archive Work Permit"
              description={`Archive permit ${permit.permit_no}? It can be restored later from the Archived tab.`}
              onConfirm={() => {
                archivePermit.mutate({
                  id: permit.id,
                  permit_no: permit.permit_no,
                  requester_name: permit.requester_name,
                }, { onSuccess: () => navigate('/permits') });
              }}
              isPending={archivePermit.isPending}
              actionLabel="Archive"
              actionIcon="archive"
              destructive={false}
            />
          )}
          {isAdmin && isPermitArchived && (
            <>
              <AdminDeleteDialog
                title="Restore Work Permit"
                description={`Restore permit ${permit.permit_no} back to active?`}
                onConfirm={() => {
                  restorePermit.mutate({
                    id: permit.id,
                    permit_no: permit.permit_no,
                    requester_name: permit.requester_name,
                  }, { onSuccess: () => navigate('/permits') });
                }}
                isPending={restorePermit.isPending}
                actionLabel="Restore"
                actionIcon="restore"
                destructive={false}
              />
              <AdminDeleteDialog
                title="Permanently Delete"
                description={`Permanently delete permit ${permit.permit_no}? This action cannot be undone.`}
                onConfirm={() => {
                  hardDeletePermit.mutate({
                    id: permit.id,
                    permit_no: permit.permit_no,
                    requester_name: permit.requester_name,
                  }, { onSuccess: () => navigate('/permits') });
                }}
                isPending={hardDeletePermit.isPending}
              />
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          <ExpiredIdsBanner permitId={permit.id} />
          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="attachments">Attachments</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6 mt-6">
              {/* Work Description */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display">Work Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{permit.work_description}</p>
                </CardContent>
              </Card>

              {/* Requester & Contractor Info */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-display">Requester</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground" />
                      {permit.requester_name}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      {permit.requester_email}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-display">Contractor</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      {permit.contractor_name}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      {permit.contact_mobile}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Location & Schedule */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-display">Location</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      {permit.work_location}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      Unit {permit.unit}, Floor {permit.floor}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-display">Schedule</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      {permit.work_date_from} to {permit.work_date_to}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      {permit.work_time_from} - {permit.work_time_to}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Workflow steps are shown in the sidebar */}
            </TabsContent>

            <TabsContent value="attachments" className="mt-6">
              <PermitAttachmentsTab
                permitId={permit.id}
                permitNo={permit.permit_no}
                requesterId={permit.requester_id}
                legacyAttachments={permit.attachments || []}
              />
            </TabsContent>

            <TabsContent value="activity" className="mt-6">
              <PermitActivityLog
                permitId={permit.id}
                permitCreatedAt={permit.created_at}
                requesterName={permit.requester_name}
              />
            </TabsContent>
          </Tabs>

          {/* Approval Actions */}
          {canApprove() && (
            <Card className="border-accent/30">
              <CardHeader>
                <CardTitle className="text-lg font-display">Your Approval</CardTitle>
                <CardDescription>
                  Review the permit details and provide your decision
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Comments</Label>
                  <Textarea
                    placeholder="Add any comments or notes..."
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setModifyWorkflowOpen(true)}
                      disabled={secureApprove.isPending}
                    >
                      <Settings2 className="w-4 h-4 mr-1" />
                      <span className="hidden sm:inline">Modify Workflow</span>
                      <span className="sm:hidden">Modify</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setForwardDialogOpen(true)}
                      disabled={secureApprove.isPending}
                    >
                      <Forward className="w-4 h-4 mr-1" />
                      Forward
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReworkDialogOpen(true)}
                      disabled={secureApprove.isPending}
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Rework
                    </Button>
                  </div>
                  <div className="flex gap-2 sm:ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={handleReject}
                      disabled={secureApprove.isPending}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="bg-success text-success-foreground hover:bg-success/90"
                      onClick={handleApprove}
                      disabled={secureApprove.isPending}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <SecureApprovalDialog
            isOpen={approvalDialogOpen}
            onClose={() => setApprovalDialogOpen(false)}
            onConfirm={handleSecureApproval}
            title={approvalAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            description={`You are about to ${approvalAction} permit ${permit.permit_no}. Please verify your identity.`}
            actionType={approvalAction}
            isLoading={secureApprove.isPending}
            authBinding={{ permitId: permit.id, role: getApprovalRole() }}
          />
          <ForwardPermitDialog
            open={forwardDialogOpen}
            onOpenChange={setForwardDialogOpen}
            permitId={permit.id}
            currentStatus={permit.status}
          />

          <ReworkDialog
            open={reworkDialogOpen}
            onOpenChange={setReworkDialogOpen}
            permitId={permit.id}
          />

          <CancelPermitDialog
            open={cancelDialogOpen}
            onOpenChange={setCancelDialogOpen}
            permitId={permit.id}
            permitNo={permit.permit_no}
          />
        </div>

        {/* Workflow Timeline Sidebar */}
        <div className="space-y-6">
          {/* Approval Progress — Phase 2c-2b
              Reads from the new permit_approvals table (Phase 2b dual-write).
              Replaces the legacy UnifiedWorkflowProgress which derived
              everything from hardcoded per-role columns on work_permits.
              Same UX: workflow-aware with pending/upcoming placeholders,
              per-permit overrides, work-type config, progress bar. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-display">
                {t('permits.approvalProgress.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PermitApprovalProgress
                permitId={permit.id}
                workTypeId={permit.work_type_id}
                permitStatus={permit.status}
              />
            </CardContent>
          </Card>

          {/* Version History */}
          <PermitVersionHistory 
            permitId={permit.id} 
            currentPermitNo={permit.permit_no}
          />
        </div>
      </div>
      {/* PDF Preview Dialog */}
      <PdfPreviewDialog
        open={pdfPreviewOpen}
        onOpenChange={setPdfPreviewOpen}
        pdfUrl={previewPdfUrl}
        fileName={`${permit.permit_no.replace(/\//g, '-')}.pdf`}
        onDownload={handleDownloadPdf}
      />
      
      {/* Modify Workflow Dialog */}
      <ModifyWorkflowDialog
        open={modifyWorkflowOpen}
        onOpenChange={setModifyWorkflowOpen}
        permitId={permit.id}
        currentWorkTypeId={permit.work_type_id || null}
        currentWorkTypeName={permit.work_types?.name || null}
        workflowTemplateId={(permit.work_types as any)?.workflow_template_id || null}
      />
    </motion.div>
  );
}
