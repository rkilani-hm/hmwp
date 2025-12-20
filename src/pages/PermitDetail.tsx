import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockPermits, workTypes } from '@/data/mockData';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { WorkflowTimeline } from '@/components/ui/WorkflowTimeline';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserRole, roleLabels } from '@/types/workPermit';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  FileText,
  MapPin,
  Phone,
  User,
  Mail,
  Paperclip,
  CheckCircle,
  XCircle,
  Download,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface PermitDetailProps {
  currentRole: UserRole;
}

export default function PermitDetail({ currentRole }: PermitDetailProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [comments, setComments] = useState('');
  const [signature, setSignature] = useState<string | null>(null);

  const permit = mockPermits.find((p) => p.id === id);

  if (!permit) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Permit not found</p>
      </div>
    );
  }

  const workType = workTypes.find((wt) => wt.id === permit.workTypeId);

  const canApprove = () => {
    if (currentRole === 'contractor') return false;
    if (currentRole === 'helpdesk' && permit.status === 'submitted') return true;
    if (currentRole === 'pm' && permit.status === 'pending_pm') return true;
    if (currentRole === 'it' && permit.status === 'pending_it') return true;
    if (currentRole === 'pm_service' && permit.status === 'pending_pm_service') return true;
    return false;
  };

  const handleApprove = () => {
    if (!signature) {
      toast.error('Please provide your signature to approve');
      return;
    }
    toast.success('Permit approved successfully');
    navigate('/permits');
  };

  const handleReject = () => {
    if (!comments) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    toast.success('Permit rejected');
    navigate('/permits');
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
              {permit.permitNo}
            </h1>
            <StatusBadge status={permit.status} />
          </div>
          <p className="text-muted-foreground mt-1">{permit.workTypeName}</p>
        </div>
        {permit.pdfUrl && (
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        )}
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
                  <p className="text-sm leading-relaxed">{permit.workDescription}</p>
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
                      {permit.requesterName}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      {permit.requesterEmail}
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
                      {permit.contractorName}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      {permit.contactMobile}
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
                      {permit.workLocation}
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
                      {permit.workDateFrom} to {permit.workDateTo}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      {permit.workTimeFrom} - {permit.workTimeTo}
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
                      {workType.requiresPM && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">PM</span>
                      )}
                      {workType.requiresPD && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">PD</span>
                      )}
                      {workType.requiresBDCR && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">BDCR</span>
                      )}
                      {workType.requiresMPR && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">MPR</span>
                      )}
                      {workType.requiresIT && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">IT</span>
                      )}
                      {workType.requiresFitOut && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">Fit-Out</span>
                      )}
                      {workType.requiresSoftFacilities && (
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full">Soft Facilities</span>
                      )}
                      {workType.requiresHardFacilities && (
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
                    {permit.attachments.length} file(s) attached
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {permit.attachments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No attachments</p>
                  ) : (
                    <div className="space-y-2">
                      {permit.attachments.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <Paperclip className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">{file}</span>
                          </div>
                          <Button variant="ghost" size="sm">
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
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
                          {new Date(permit.createdAt).toLocaleString()} by {permit.requesterName}
                        </p>
                      </div>
                    </div>
                    {permit.helpdeskApproval.status === 'approved' && (
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 mt-2 rounded-full bg-success" />
                        <div>
                          <p className="text-sm font-medium">Helpdesk Approved</p>
                          <p className="text-xs text-muted-foreground">
                            {permit.helpdeskApproval.date} by {permit.helpdeskApproval.approverName}
                          </p>
                          {permit.helpdeskApproval.comments && (
                            <p className="text-xs text-muted-foreground mt-1">
                              "{permit.helpdeskApproval.comments}"
                            </p>
                          )}
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

                <div className="space-y-2">
                  <Label>Signature</Label>
                  <SignaturePad
                    onSave={(sig) => setSignature(sig)}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={handleReject}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                    onClick={handleApprove}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Workflow Timeline Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Workflow Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowTimeline permit={permit} />
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
