import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGatePass, useCompleteGatePass } from '@/hooks/useGatePasses';
import { useSecureApproveGatePass } from '@/hooks/useSecureApproveGatePass';
import { useArchiveGatePass, useRestoreGatePass, useHardDeleteGatePass } from '@/hooks/useDeleteGatePass';
import { AdminDeleteDialog } from '@/components/AdminDeleteDialog';
import { useGatePassEffectiveWorkflow } from '@/hooks/useGatePassTypeWorkflows';
import { SecureApprovalDialog } from '@/components/SecureApprovalDialog';
import { GatePassApprovalProgress } from '@/components/GatePassApprovalProgress';
import type { AuthPayload } from '@/components/SecureApprovalDialog';
import { useAuth } from '@/contexts/AuthContext';
import { gatePassStatusLabels, gatePassCategoryLabels, gatePassTypeLabels, shiftingMethodLabels, deliveryTypeLabels } from '@/types/gatePass';
import type { GatePassStatus } from '@/types/gatePass';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Printer, CheckCircle, XCircle, Clock, FileDown, Loader2, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import GatePassPrintView from '@/components/GatePassPrintView';
import { useGenerateGatePassPdf } from '@/hooks/useGenerateGatePassPdf';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_store_manager: 'bg-warning/10 text-warning',
  pending_finance: 'bg-info/10 text-info',
  pending_security: 'bg-accent/10 text-accent',
  pending_security_pmd: 'bg-accent/10 text-accent',
  pending_cr_coordinator: 'bg-warning/10 text-warning',
  pending_head_cr: 'bg-info/10 text-info',
  pending_hm_security_pmd: 'bg-accent/10 text-accent',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  completed: 'bg-primary/10 text-primary',
};

export default function GatePassDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: gp, isLoading } = useGatePass(id);
  const { roles } = useAuth();
  const { data: effectiveWorkflow } = useGatePassEffectiveWorkflow(gp?.pass_type);
  const approveGatePass = useSecureApproveGatePass();
  const completeGatePass = useCompleteGatePass();
  const archiveGP = useArchiveGatePass();
  const restoreGP = useRestoreGatePass();
  const hardDeleteGP = useHardDeleteGatePass();
  const isAdmin = roles.includes('admin');
  const isGPArchived = (gp as any)?.is_archived;

  const [comments, setComments] = useState('');
  const [cctvConfirmed, setCctvConfirmed] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { generatePdf, isGenerating } = useGenerateGatePassPdf();
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailName, setEmailName] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Secure approval dialog state
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [approvalRole, setApprovalRole] = useState<string>('');

  if (isLoading) return <p className="text-muted-foreground p-8">Loading...</p>;
  if (!gp) return <p className="text-destructive p-8">Gate pass not found.</p>;

  const canApproveAs = (role: string) => {
    return roles.includes(role) && gp.status === `pending_${role}`;
  };

  // Build the list of approval roles from workflow or defaults
  const getApprovalRoles = (): string[] => {
    if (effectiveWorkflow?.steps) {
      return effectiveWorkflow.steps.map(s => s.role && typeof s.role === 'object' && 'name' in s.role ? (s.role as any).name : '').filter(Boolean);
    }
    return ['store_manager', ...(gp.has_high_value_asset ? ['finance'] : []), 'security'];
  };

  const approvalRoles = getApprovalRoles();

  const canComplete = (roles.includes('security') || roles.includes('hm_security_pmd') || roles.includes('admin')) && gp.status === 'approved';

  const handleOpenApprovalDialog = (role: string, action: 'approve' | 'reject') => {
    setApprovalRole(role);
    setApprovalAction(action);
    setApprovalDialogOpen(true);
  };

  const handleSecureApproval = async (auth: AuthPayload, signature: string | null) => {
    await approveGatePass.mutateAsync({
      gatePassId: gp.id,
      role: approvalRole,
      approved: approvalAction === 'approve',
      comments,
      signature: approvalAction === 'approve' ? signature : null,
      auth,
      cctvConfirmed: approvalRole === 'security' ? cctvConfirmed : undefined,
    });

    setApprovalDialogOpen(false);
    setComments('');
  };

  const handlePrint = () => {
    setShowPrint(true);
    setTimeout(() => {
      window.print();
      setShowPrint(false);
    }, 400);
  };

  const handleDownloadPdf = async () => {
    const url = await generatePdf(gp.id);
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleOpenEmailDialog = () => {
    setEmailTo(gp.client_rep_email || gp.requester_email || '');
    setEmailName(gp.client_rep_name || gp.requester_name || '');
    setShowEmailDialog(true);
  };

  const handleSendEmail = async () => {
    if (!emailTo.trim()) {
      toast.error('Please enter a recipient email address.');
      return;
    }
    setIsSendingEmail(true);
    try {
      if (!gp.pdf_url) {
        toast.info('Generating PDF first...');
        const url = await generatePdf(gp.id);
        if (!url) {
          toast.error('Failed to generate PDF. Cannot send email.');
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        toast.error('Session expired. Please sign in again.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('email-gate-pass-pdf', {
        body: {
          gatePassId: gp.id,
          recipientEmail: emailTo.trim(),
          recipientName: emailName.trim(),
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) {
        console.error('Email error:', error);
        toast.error('Failed to send email. Please try again.');
        return;
      }

      if (data?.success) {
        toast.success(`Gate pass PDF emailed to ${emailTo}`);
        setShowEmailDialog(false);
      } else {
        toast.error(data?.error || 'Failed to send email.');
      }
    } catch (err) {
      console.error('Email error:', err);
      toast.error('An error occurred while sending the email.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // (Phase 2c-4: legacy statusTimeline removed — GatePassApprovalProgress
  // now derives all workflow state from gate_pass_approvals.)

  return (
    <div className="space-y-6">
      {/* Print view */}
      {showPrint && (
        <div className="gate-pass-print-area">
          <GatePassPrintView gatePass={gp} ref={printRef} />
        </div>
      )}

      <div className="print:hidden space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/gate-passes')}><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{gp.pass_no}</h1>
              <p className="text-muted-foreground">{gatePassCategoryLabels[gp.pass_category]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusColors[gp.status] || 'bg-warning/10 text-warning'}>{gatePassStatusLabels[gp.status] || gp.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Badge>
            <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
            {isAdmin && !isGPArchived && (
              <AdminDeleteDialog
                title="Archive Gate Pass"
                description={`Archive gate pass ${gp.pass_no}? It can be restored later.`}
                onConfirm={() => {
                  archiveGP.mutate({ id: gp.id, pass_no: gp.pass_no, requester_name: gp.requester_name }, {
                    onSuccess: () => navigate('/gate-passes'),
                  });
                }}
                isPending={archiveGP.isPending}
                actionLabel="Archive"
                actionIcon="archive"
                destructive={false}
              />
            )}
            {isAdmin && isGPArchived && (
              <>
                <AdminDeleteDialog
                  title="Restore Gate Pass"
                  description={`Restore gate pass ${gp.pass_no} back to active?`}
                  onConfirm={() => {
                    restoreGP.mutate({ id: gp.id, pass_no: gp.pass_no, requester_name: gp.requester_name }, {
                      onSuccess: () => navigate('/gate-passes'),
                    });
                  }}
                  isPending={restoreGP.isPending}
                  actionLabel="Restore"
                  actionIcon="restore"
                  destructive={false}
                />
                <AdminDeleteDialog
                  title="Permanently Delete"
                  description={`Permanently delete gate pass ${gp.pass_no}? This cannot be undone.`}
                  onConfirm={() => {
                    hardDeleteGP.mutate({ id: gp.id, pass_no: gp.pass_no, requester_name: gp.requester_name }, {
                      onSuccess: () => navigate('/gate-passes'),
                    });
                  }}
                  isPending={hardDeleteGP.isPending}
                />
              </>
            )}
            {(gp.status === 'approved' || gp.status === 'completed') && (
              <>
                <Button variant="outline" onClick={handleOpenEmailDialog}>
                  <Mail className="mr-2 h-4 w-4" /> Email to Client
                </Button>
                <Button variant="outline" onClick={handleDownloadPdf} disabled={isGenerating}>
                  {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                  {isGenerating ? 'Generating...' : 'Download PDF'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Status Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('gatePasses.approvalProgress.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <GatePassApprovalProgress
              gatePassId={gp.id}
              expectedRoles={approvalRoles}
              gatePassStatus={gp.status}
            />
          </CardContent>
        </Card>

        {/* Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-lg">Pass Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Type:</span><span>{gatePassTypeLabels[gp.pass_type]}</span>
                <span className="text-muted-foreground">Requestor:</span><span>{gp.requester_name}</span>
                <span className="text-muted-foreground">Date:</span><span>{format(new Date(gp.date_of_request), 'dd MMM yyyy')}</span>
                {gp.client_contractor_name && <><span className="text-muted-foreground">Client/Contractor:</span><span>{gp.client_contractor_name}</span></>}
                {gp.unit_floor && <><span className="text-muted-foreground">Unit/Floor:</span><span>{gp.unit_floor}</span></>}
                {gp.delivery_area && <><span className="text-muted-foreground">Delivery Area:</span><span>{gp.delivery_area}</span></>}
                {gp.shifting_method && <><span className="text-muted-foreground">Shifting Method:</span><span>{shiftingMethodLabels[gp.shifting_method]}</span></>}
                {gp.delivery_type && <><span className="text-muted-foreground">Delivery Type:</span><span>{deliveryTypeLabels[gp.delivery_type]}</span></>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Schedule & Vehicle</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                {gp.valid_from && <><span className="text-muted-foreground">Valid From:</span><span>{gp.valid_from}</span></>}
                {gp.valid_to && <><span className="text-muted-foreground">Valid To:</span><span>{gp.valid_to}</span></>}
                {gp.time_from && <><span className="text-muted-foreground">Time:</span><span>{gp.time_from} - {gp.time_to}</span></>}
                {gp.vehicle_make_model && <><span className="text-muted-foreground">Vehicle:</span><span>{gp.vehicle_make_model}</span></>}
                {gp.vehicle_license_plate && <><span className="text-muted-foreground">Plate:</span><span>{gp.vehicle_license_plate}</span></>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Items */}
        {gp.items && gp.items.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Items</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SR</TableHead>
                    <TableHead>Item Details</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>High Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gp.items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.serial_number}</TableCell>
                      <TableCell>{item.item_details}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.remarks || '-'}</TableCell>
                      <TableCell>{item.is_high_value ? <Badge variant="destructive">Yes</Badge> : 'No'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {gp.purpose && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Purpose</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{gp.purpose}</p></CardContent>
          </Card>
        )}

        {/* Approval Actions */}
        {(approvalRoles.some(r => canApproveAs(r)) || canComplete) && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Actions</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Comments</Label>
                <Textarea value={comments} onChange={e => setComments(e.target.value)} placeholder="Add comments..." rows={3} />
              </div>

              {canApproveAs('security') && (
                <div className="flex items-center gap-2">
                  <Switch checked={cctvConfirmed} onCheckedChange={setCctvConfirmed} />
                  <Label>CCTV Monitoring Confirmed</Label>
                </div>
              )}

              <Separator />

              <div className="flex gap-3 flex-wrap">
                {canComplete && (
                  <Button onClick={() => completeGatePass.mutate(gp.id)} disabled={completeGatePass.isPending}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Mark Completed
                  </Button>
                )}
                {approvalRoles.map(role => {
                  if (!canApproveAs(role)) return null;
                  return (
                    <div key={role} className="flex gap-2">
                      <Button onClick={() => handleOpenApprovalDialog(role, 'approve')} disabled={approveGatePass.isPending}>
                        <CheckCircle className="mr-2 h-4 w-4" /> Approve
                      </Button>
                      <Button variant="destructive" onClick={() => handleOpenApprovalDialog(role, 'reject')} disabled={approveGatePass.isPending}>
                        <XCircle className="mr-2 h-4 w-4" /> Reject
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Secure Approval Dialog - reuses the same component from Work Permits */}
      <SecureApprovalDialog
        isOpen={approvalDialogOpen}
        onClose={() => setApprovalDialogOpen(false)}
        onConfirm={handleSecureApproval}
        title={approvalAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
        description={
          approvalAction === 'approve'
            ? `Please verify your identity and provide your signature to approve gate pass ${gp.pass_no}.`
            : `Please verify your identity to reject gate pass ${gp.pass_no}.`
        }
        actionType={approvalAction}
        isLoading={approveGatePass.isPending}
        authBinding={{ gatePassId: gp.id, role: approvalRole }}
      />

      {/* Email to Client Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email Gate Pass PDF</DialogTitle>
            <DialogDescription>
              Send the gate pass PDF as an email attachment to the client representative.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="email-name">Recipient Name</Label>
              <Input
                id="email-name"
                value={emailName}
                onChange={e => setEmailName(e.target.value)}
                placeholder="Client representative name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-to">Recipient Email</Label>
              <Input
                id="email-to"
                type="email"
                value={emailTo}
                onChange={e => setEmailTo(e.target.value)}
                placeholder="client@example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>Cancel</Button>
            <Button onClick={handleSendEmail} disabled={isSendingEmail || !emailTo.trim()}>
              {isSendingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              {isSendingEmail ? 'Sending...' : 'Send Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
