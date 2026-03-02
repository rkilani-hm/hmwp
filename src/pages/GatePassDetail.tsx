import { useParams, useNavigate } from 'react-router-dom';
import { useGatePass, useApproveGatePass, useCompleteGatePass } from '@/hooks/useGatePasses';
import { useAuth } from '@/contexts/AuthContext';
import { gatePassStatusLabels, gatePassCategoryLabels, gatePassTypeLabels, shiftingMethodLabels, deliveryTypeLabels } from '@/types/gatePass';
import type { GatePassStatus } from '@/types/gatePass';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Printer, CheckCircle, XCircle, Clock, FileDown, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useState, useRef } from 'react';
import GatePassPrintView from '@/components/GatePassPrintView';
import { useGenerateGatePassPdf } from '@/hooks/useGenerateGatePassPdf';

const statusColors: Record<GatePassStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_store_manager: 'bg-warning/10 text-warning',
  pending_finance: 'bg-info/10 text-info',
  pending_security: 'bg-accent/10 text-accent',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  completed: 'bg-primary/10 text-primary',
};

export default function GatePassDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: gp, isLoading } = useGatePass(id);
  const { roles } = useAuth();
  const approveGatePass = useApproveGatePass();
  const completeGatePass = useCompleteGatePass();

  const [comments, setComments] = useState('');
  const [cctvConfirmed, setCctvConfirmed] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { generatePdf, isGenerating } = useGenerateGatePassPdf();

  if (isLoading) return <p className="text-muted-foreground p-8">Loading...</p>;
  if (!gp) return <p className="text-destructive p-8">Gate pass not found.</p>;

  const canApproveAs = (role: 'store_manager' | 'finance' | 'security') => {
    const statusMap = {
      store_manager: 'pending_store_manager',
      finance: 'pending_finance',
      security: 'pending_security',
    };
    return roles.includes(role) && gp.status === statusMap[role];
  };

  const canComplete = roles.includes('security') && gp.status === 'approved';

  const handleApprove = (role: 'store_manager' | 'finance' | 'security', approved: boolean) => {
    approveGatePass.mutate({
      gatePassId: gp.id,
      role,
      approved,
      comments,
      cctvConfirmed: role === 'security' ? cctvConfirmed : undefined,
    });
  };

  const handlePrint = () => {
    setShowPrint(true);
    setTimeout(() => window.print(), 300);
  };

  const handleDownloadPdf = async () => {
    const url = await generatePdf(gp.id);
    if (url) {
      window.open(url, '_blank');
    }
  };

  const statusTimeline = [
    { label: 'Submitted', done: true, date: gp.created_at },
    { label: 'Store Manager', done: !!gp.store_manager_date, date: gp.store_manager_date },
    ...(gp.has_high_value_asset ? [{ label: 'Finance', done: !!gp.finance_date, date: gp.finance_date }] : []),
    { label: 'Security', done: !!gp.security_date, date: gp.security_date },
    { label: gp.status === 'completed' ? 'Completed' : 'Approved', done: gp.status === 'approved' || gp.status === 'completed', date: gp.completed_at || gp.security_date },
  ];

  return (
    <div className="space-y-6">
      {/* Print view (hidden on screen) */}
      {showPrint && (
        <div className="hidden print:block">
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
            <Badge className={statusColors[gp.status]}>{gatePassStatusLabels[gp.status]}</Badge>
            {(gp.status === 'approved' || gp.status === 'completed') && (
              <>
                <Button variant="outline" onClick={handleDownloadPdf} disabled={isGenerating}>
                  {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                  {isGenerating ? 'Generating...' : 'Download PDF'}
                </Button>
                <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
              </>
            )}
          </div>
        </div>

        {/* Status Timeline */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Workflow Progress</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {statusTimeline.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${s.done ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {s.done ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {s.label}
                  </div>
                  {i < statusTimeline.length - 1 && <div className="w-6 h-px bg-border flex-shrink-0" />}
                </div>
              ))}
            </div>
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
        {(canApproveAs('store_manager') || canApproveAs('finance') || canApproveAs('security') || canComplete) && (
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

              <div className="flex gap-3">
                {canComplete && (
                  <Button onClick={() => completeGatePass.mutate(gp.id)} disabled={completeGatePass.isPending}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Mark Completed
                  </Button>
                )}
                {['store_manager', 'finance', 'security'].map(role => {
                  if (!canApproveAs(role as any)) return null;
                  return (
                    <div key={role} className="flex gap-2">
                      <Button onClick={() => handleApprove(role as any, true)} disabled={approveGatePass.isPending}>
                        <CheckCircle className="mr-2 h-4 w-4" /> Approve
                      </Button>
                      <Button variant="destructive" onClick={() => handleApprove(role as any, false)} disabled={approveGatePass.isPending}>
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
    </div>
  );
}
