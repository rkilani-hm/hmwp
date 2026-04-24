import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkPermit, useSecureApprovePermit } from '@/hooks/useWorkPermits';
import { useArchiveWorkPermit, useRestoreWorkPermit, useHardDeleteWorkPermit } from '@/hooks/useDeleteWorkPermit';
import { AdminDeleteDialog } from '@/components/AdminDeleteDialog';
import { useGeneratePdf } from '@/hooks/useGeneratePdf';
import { useResendNotification } from '@/hooks/useResendNotification';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { UnifiedWorkflowProgress, UnifiedPermitData } from '@/components/ui/UnifiedWorkflowProgress';
import { PermitApprovalsList } from '@/components/PermitApprovalsList';
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
} from 'lucide-react';
import { AttachmentPreview } from '@/components/ui/AttachmentPreview';
import { PermitVersionHistory } from '@/components/PermitVersionHistory';
import { PermitActivityLog } from '@/components/PermitActivityLog';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, isPast, parseISO } from 'date-fns';

interface PermitDetailProps {
  currentRole: string;
}

export default function PermitDetail({ currentRole }: PermitDetailProps) {
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

  // Dynamic status-to-role mapping for all workflow types
  const statusToRole: Record<string, string> = {
    // Legacy internal workflow
    'submitted': 'helpdesk',
    'under_review': 'helpdesk',
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

  const canApprove = () => {
    if (currentRole === 'contractor') return false;
    const requiredRole = statusToRole[permit.status];
    if (!requiredRole) return false;
    return roles.includes(requiredRole as any);
  };

  const getApprovalRole = (): string => {
    const role = statusToRole[permit.status];
    if (role && roles.includes(role as any)) {
      return role;
    }
    // Fallback: return the first matching approver role the user has
    const allApproverRoles = Object.values(statusToRole);
    return roles.find(r => allApproverRoles.includes(r)) || 'helpdesk';
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

  // Cast permit to unified data format for workflow progress
  const p = permit as any;
  const unifiedPermit: UnifiedPermitData = {
    id: permit.id,
    status: permit.status,
    work_type_id: permit.work_type_id,
    is_internal: p.is_internal ?? null,
    workflow_customized: p.workflow_customized ?? false,
    // Approval statuses
    customer_service_status: p.customer_service_status,
    helpdesk_status: permit.helpdesk_status,
    cr_coordinator_status: p.cr_coordinator_status,
    head_cr_status: p.head_cr_status,
    pm_status: permit.pm_status,
    pd_status: permit.pd_status,
    bdcr_status: permit.bdcr_status,
    mpr_status: permit.mpr_status,
    it_status: permit.it_status,
    fitout_status: permit.fitout_status,
    ecovert_supervisor_status: p.ecovert_supervisor_status,
    pmd_coordinator_status: p.pmd_coordinator_status,
    fmsp_approval_status: p.fmsp_approval_status,
    // Approver names
    customer_service_approver_name: p.customer_service_approver_name,
    helpdesk_approver_name: permit.helpdesk_approver_name,
    cr_coordinator_approver_name: p.cr_coordinator_approver_name,
    head_cr_approver_name: p.head_cr_approver_name,
    pm_approver_name: permit.pm_approver_name,
    pd_approver_name: permit.pd_approver_name,
    bdcr_approver_name: p.bdcr_approver_name,
    mpr_approver_name: p.mpr_approver_name,
    it_approver_name: p.it_approver_name,
    fitout_approver_name: p.fitout_approver_name,
    ecovert_supervisor_approver_name: p.ecovert_supervisor_approver_name,
    pmd_coordinator_approver_name: p.pmd_coordinator_approver_name,
    fmsp_approval_approver_name: p.fmsp_approval_approver_name,
    // Approval dates
    customer_service_date: p.customer_service_date,
    helpdesk_date: permit.helpdesk_date,
    cr_coordinator_date: p.cr_coordinator_date,
    head_cr_date: p.head_cr_date,
    pm_date: permit.pm_date,
    pd_date: permit.pd_date,
    bdcr_date: p.bdcr_date,
    mpr_date: p.mpr_date,
    it_date: p.it_date,
    fitout_date: p.fitout_date,
    ecovert_supervisor_date: p.ecovert_supervisor_date,
    pmd_coordinator_date: p.pmd_coordinator_date,
    fmsp_approval_date: p.fmsp_approval_date,
    // Approval comments
    customer_service_comments: p.customer_service_comments,
    helpdesk_comments: permit.helpdesk_comments,
    cr_coordinator_comments: p.cr_coordinator_comments,
    head_cr_comments: p.head_cr_comments,
    pm_comments: permit.pm_comments,
    pd_comments: permit.pd_comments,
    bdcr_comments: p.bdcr_comments,
    mpr_comments: p.mpr_comments,
    it_comments: p.it_comments,
    fitout_comments: p.fitout_comments,
    ecovert_supervisor_comments: p.ecovert_supervisor_comments,
    pmd_coordinator_comments: p.pmd_coordinator_comments,
    fmsp_approval_comments: p.fmsp_approval_comments,
    // Work type requirements for legacy fallback
    work_types: workType ? {
      requires_pm: workType.requires_pm,
      requires_pd: workType.requires_pd,
      requires_bdcr: workType.requires_bdcr,
      requires_mpr: workType.requires_mpr,
      requires_it: workType.requires_it,
      requires_fitout: workType.requires_fitout,
      requires_ecovert_supervisor: workType.requires_ecovert_supervisor,
      requires_pmd_coordinator: workType.requires_pmd_coordinator,
    } : null,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
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
          </div>
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
          {/* Cancel button for creators - only show for active permits */}
          {permit.requester_id === user?.id && 
           !['cancelled', 'rejected', 'closed', 'approved', 'rework_needed'].includes(permit.status) && (
            <Button 
              variant="outline" 
              size="sm"
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setCancelDialogOpen(true)}
            >
              <Ban className="w-4 h-4 mr-2" />
              Cancel
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
          {permit.pdf_url && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handlePreviewPdf}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Eye className="w-4 h-4 mr-2" />
              )}
              <span className="hidden sm:inline">View PDF</span>
              <span className="sm:hidden">PDF</span>
            </Button>
          )}
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
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display">Attachments</CardTitle>
                  <CardDescription>
                    {(permit.attachments || []).length} file(s) attached
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(permit.attachments || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No attachments</p>
                  ) : (
                    <div className="space-y-2">
                      {(permit.attachments || []).map((filePath, index) => {
                        // Extract filename from path
                        const filename = filePath.includes('/') 
                          ? decodeURIComponent(filePath.split('/').pop() || `attachment-${index + 1}`)
                          : filePath;
                        return (
                          <AttachmentPreview
                            key={index}
                            filePath={filePath}
                            filename={filename}
                          />
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-6">
              <PermitActivityLog 
                permitId={permit.id}
                permitCreatedAt={permit.created_at}
                requesterName={permit.requester_name}
                approvals={{
                  customer_service: {
                    status: p.customer_service_status,
                    approver_name: p.customer_service_approver_name,
                    date: p.customer_service_date,
                    comments: p.customer_service_comments,
                  },
                  helpdesk: {
                    status: permit.helpdesk_status,
                    approver_name: permit.helpdesk_approver_name,
                    date: permit.helpdesk_date,
                    comments: permit.helpdesk_comments,
                  },
                  cr_coordinator: {
                    status: p.cr_coordinator_status,
                    approver_name: p.cr_coordinator_approver_name,
                    date: p.cr_coordinator_date,
                    comments: p.cr_coordinator_comments,
                  },
                  head_cr: {
                    status: p.head_cr_status,
                    approver_name: p.head_cr_approver_name,
                    date: p.head_cr_date,
                    comments: p.head_cr_comments,
                  },
                  pm: {
                    status: permit.pm_status,
                    approver_name: permit.pm_approver_name,
                    date: permit.pm_date,
                    comments: permit.pm_comments,
                  },
                  pd: {
                    status: permit.pd_status,
                    approver_name: permit.pd_approver_name,
                    date: permit.pd_date,
                    comments: permit.pd_comments,
                  },
                  bdcr: {
                    status: p.bdcr_status,
                    approver_name: p.bdcr_approver_name,
                    date: p.bdcr_date,
                    comments: p.bdcr_comments,
                  },
                  mpr: {
                    status: p.mpr_status,
                    approver_name: p.mpr_approver_name,
                    date: p.mpr_date,
                    comments: p.mpr_comments,
                  },
                  it: {
                    status: p.it_status,
                    approver_name: p.it_approver_name,
                    date: p.it_date,
                    comments: p.it_comments,
                  },
                  fitout: {
                    status: p.fitout_status,
                    approver_name: p.fitout_approver_name,
                    date: p.fitout_date,
                    comments: p.fitout_comments,
                  },
                  ecovert_supervisor: {
                    status: p.ecovert_supervisor_status,
                    approver_name: p.ecovert_supervisor_approver_name,
                    date: p.ecovert_supervisor_date,
                    comments: p.ecovert_supervisor_comments,
                  },
                  pmd_coordinator: {
                    status: p.pmd_coordinator_status,
                    approver_name: p.pmd_coordinator_approver_name,
                    date: p.pmd_coordinator_date,
                    comments: p.pmd_coordinator_comments,
                  },
                  fmsp_approval: {
                    status: p.fmsp_approval_status,
                    approver_name: p.fmsp_approval_approver_name,
                    date: p.fmsp_approval_date,
                    comments: p.fmsp_approval_comments,
                  },
                }}
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
          {/* Unified Workflow Progress */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-display">Approval Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <UnifiedWorkflowProgress permit={unifiedPermit} />
            </CardContent>
          </Card>

          {/*
            Phase 2c-2 A/B verification panel — visible to admins only while
            we validate that the new permit_approvals table populated by
            Phase 2b dual-write matches what the legacy per-role columns
            say. After a verification window with zero observed drift, we
            flip this block so PermitApprovalsList becomes the primary
            surface and the legacy UnifiedWorkflowProgress is removed
            (Phase 2c-2b).
          */}
          {isAdmin && (
            <Card className="border-dashed border-info/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display text-muted-foreground">
                  Approvals (new data source — verification only)
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Read from <code className="text-xs">permit_approvals</code>. Should match the panel above.
                </p>
              </CardHeader>
              <CardContent>
                <PermitApprovalsList permitId={permit.id} />
              </CardContent>
            </Card>
          )}

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
