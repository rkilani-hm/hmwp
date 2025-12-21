import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkPermit, useSecureApprovePermit } from '@/hooks/useWorkPermits';
import { useGeneratePdf } from '@/hooks/useGeneratePdf';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { WorkflowTimeline, WorkflowPermit } from '@/components/ui/WorkflowTimeline';
import { SecureApprovalDialog } from '@/components/SecureApprovalDialog';
import { ForwardPermitDialog } from '@/components/ForwardPermitDialog';
import { ReworkDialog } from '@/components/ReworkDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { UserRole, PermitStatus } from '@/types/workPermit';
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
  Loader2,
  FileText,
  AlertTriangle,
  Timer,
  Forward,
  RotateCcw,
} from 'lucide-react';
import { AttachmentPreview } from '@/components/ui/AttachmentPreview';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, isPast, parseISO } from 'date-fns';

interface PermitDetailProps {
  currentRole: UserRole;
}

export default function PermitDetail({ currentRole }: PermitDetailProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const [comments, setComments] = useState('');
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [reworkDialogOpen, setReworkDialogOpen] = useState(false);

  const { data: permit, isLoading, error } = useWorkPermit(id);
  const secureApprove = useSecureApprovePermit();
  const { generatePdf, isGenerating } = useGeneratePdf();

  const handleGeneratePdf = async () => {
    if (!permit) return;
    const pdfUrl = await generatePdf(permit.id);
    if (pdfUrl) {
      // Refetch permit to get the updated pdf_url
      queryClient.invalidateQueries({ queryKey: ['work-permit', id] });
      // Trigger download
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `${permit.permit_no.replace(/\//g, '-')}.pdf`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDownloadPdf = () => {
    if (permit?.pdf_url) {
      const link = document.createElement('a');
      link.href = permit.pdf_url;
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

  const canApprove = () => {
    if (currentRole === 'contractor') return false;
    if (roles.includes('helpdesk') && permit.status === 'submitted') return true;
    if (roles.includes('pm') && permit.status === 'pending_pm') return true;
    if (roles.includes('pd') && permit.status === 'pending_pd') return true;
    if (roles.includes('bdcr') && permit.status === 'pending_bdcr') return true;
    if (roles.includes('mpr') && permit.status === 'pending_mpr') return true;
    if (roles.includes('it') && permit.status === 'pending_it') return true;
    if (roles.includes('fitout') && permit.status === 'pending_fitout') return true;
    if (roles.includes('soft_facilities') && permit.status === 'pending_soft_facilities') return true;
    if (roles.includes('hard_facilities') && permit.status === 'pending_hard_facilities') return true;
    if (roles.includes('pm_service') && permit.status === 'pending_pm_service') return true;
    return false;
  };

  const getApprovalRole = (): string => {
    if (permit.status === 'submitted') return 'helpdesk';
    if (permit.status === 'pending_pm') return 'pm';
    if (permit.status === 'pending_pd') return 'pd';
    if (permit.status === 'pending_bdcr') return 'bdcr';
    if (permit.status === 'pending_mpr') return 'mpr';
    if (permit.status === 'pending_it') return 'it';
    if (permit.status === 'pending_fitout') return 'fitout';
    if (permit.status === 'pending_soft_facilities') return 'soft_facilities';
    if (permit.status === 'pending_hard_facilities') return 'hard_facilities';
    if (permit.status === 'pending_pm_service') return 'pm_service';
    return 'helpdesk';
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

  const handleSecureApproval = async (password: string, signature: string) => {
    await secureApprove.mutateAsync({
      permitId: permit.id,
      role: getApprovalRole(),
      comments,
      signature: approvalAction === 'approve' ? signature : null,
      approved: approvalAction === 'approve',
      password,
    });
    setApprovalDialogOpen(false);
    setComments('');
  };

  // Transform permit data for WorkflowTimeline
  const transformedPermit: WorkflowPermit = {
    id: permit.id,
    status: permit.status as PermitStatus,
    helpdeskApproval: {
      status: (permit.helpdesk_status as 'pending' | 'approved' | 'rejected') || 'pending',
      approverName: permit.helpdesk_approver_name || undefined,
      date: permit.helpdesk_date || undefined,
      comments: permit.helpdesk_comments || undefined,
      signature: permit.helpdesk_signature || undefined,
    },
    pmApproval: {
      status: (permit.pm_status as 'pending' | 'approved' | 'rejected') || 'pending',
      approverName: permit.pm_approver_name || undefined,
      date: permit.pm_date || undefined,
      comments: permit.pm_comments || undefined,
      signature: permit.pm_signature || undefined,
    },
    pdApproval: {
      status: (permit.pd_status as 'pending' | 'approved' | 'rejected') || 'pending',
      approverName: permit.pd_approver_name || undefined,
      date: permit.pd_date || undefined,
      comments: permit.pd_comments || undefined,
      signature: permit.pd_signature || undefined,
    },
    bdcrApproval: {
      status: (permit.bdcr_status as 'pending' | 'approved' | 'rejected') || 'pending',
    },
    mprApproval: {
      status: (permit.mpr_status as 'pending' | 'approved' | 'rejected') || 'pending',
    },
    itApproval: {
      status: (permit.it_status as 'pending' | 'approved' | 'rejected') || 'pending',
    },
    fitoutApproval: {
      status: (permit.fitout_status as 'pending' | 'approved' | 'rejected') || 'pending',
    },
    softFacilitiesApproval: {
      status: (permit.soft_facilities_status as 'pending' | 'approved' | 'rejected') || 'pending',
    },
    hardFacilitiesApproval: {
      status: (permit.hard_facilities_status as 'pending' | 'approved' | 'rejected') || 'pending',
    },
    pmServiceApproval: {
      status: (permit.pm_service_status as 'pending' | 'approved' | 'rejected') || 'pending',
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-display font-bold">
              {permit.permit_no}
            </h1>
            <StatusBadge status={permit.status as PermitStatus} />
          </div>
          <p className="text-muted-foreground mt-1">{permit.work_types?.name || 'General Work'}</p>
        </div>
        <div className="flex gap-2">
          {!permit.pdf_url && (
            <Button 
              variant="default" 
              onClick={handleGeneratePdf}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 mr-2" />
              )}
              Generate PDF
            </Button>
          )}
          {permit.pdf_url && (
            <Button variant="outline" onClick={handleDownloadPdf}>
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
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

              {/* Required Approvals */}
              {workType && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-display">Required Approvals</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs bg-muted px-2.5 py-1 rounded-full">Helpdesk</span>
                      {workType.requires_pm && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">PM</span>
                      )}
                      {workType.requires_pd && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">PD</span>
                      )}
                      {workType.requires_bdcr && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">BDCR</span>
                      )}
                      {workType.requires_mpr && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">MPR</span>
                      )}
                      {workType.requires_it && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">IT</span>
                      )}
                      {workType.requires_fitout && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">Fit-Out</span>
                      )}
                      {workType.requires_soft_facilities && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">Soft Facilities</span>
                      )}
                      {workType.requires_hard_facilities && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">Hard Facilities</span>
                      )}
                      <span className="text-xs bg-muted px-2.5 py-1 rounded-full">PM Service</span>
                    </div>
                  </CardContent>
                </Card>
              )}
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
                      {(permit.attachments || []).map((url, index) => {
                        // Extract filename from URL or use index
                        const filename = url.includes('/') 
                          ? decodeURIComponent(url.split('/').pop() || `attachment-${index + 1}`)
                          : url;
                        return (
                          <AttachmentPreview
                            key={index}
                            url={url}
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
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display">Activity Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 mt-2 rounded-full bg-success" />
                      <div>
                        <p className="text-sm font-medium">Permit Created</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(permit.created_at).toLocaleString()} by {permit.requester_name}
                        </p>
                      </div>
                    </div>
                    {permit.helpdesk_status === 'approved' && (
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 mt-2 rounded-full bg-success" />
                        <div>
                          <p className="text-sm font-medium">Helpdesk Approved</p>
                          <p className="text-xs text-muted-foreground">
                            {permit.helpdesk_date && new Date(permit.helpdesk_date).toLocaleString()} by {permit.helpdesk_approver_name}
                          </p>
                          {permit.helpdesk_comments && (
                            <p className="text-xs text-muted-foreground mt-1">
                              "{permit.helpdesk_comments}"
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {permit.pm_status === 'approved' && (
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 mt-2 rounded-full bg-success" />
                        <div>
                          <p className="text-sm font-medium">PM Approved</p>
                          <p className="text-xs text-muted-foreground">
                            {permit.pm_date && new Date(permit.pm_date).toLocaleString()} by {permit.pm_approver_name}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
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

                <div className="flex flex-wrap gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setForwardDialogOpen(true)}
                    disabled={secureApprove.isPending}
                  >
                    <Forward className="w-4 h-4 mr-2" />
                    Forward
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setReworkDialogOpen(true)}
                    disabled={secureApprove.isPending}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Rework
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={handleReject}
                    disabled={secureApprove.isPending}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    className="bg-success text-success-foreground hover:bg-success/90"
                    onClick={handleApprove}
                    disabled={secureApprove.isPending}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
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
        </div>

        {/* Workflow Timeline Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Workflow Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowTimeline permit={transformedPermit} />
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
