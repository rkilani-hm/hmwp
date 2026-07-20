import { useMemo, useState } from 'react';
import { useEmailDeliveryLogs } from '@/hooks/useEmailDeliveryLogs';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Mail, Paperclip } from 'lucide-react';
import { format } from 'date-fns';

// Human labels for the notification types the edge function emits.
const typeLabels: Record<string, string> = {
  new_permit: 'New permit',
  approval_required: 'Approval required',
  approved: 'Approved',
  rejected: 'Rejected',
  rework: 'Rework',
  forwarded: 'Forwarded',
  closed: 'Closed',
  sla_warning: 'SLA warning',
  sla_breach: 'SLA breach',
  status_update: 'Status update',
  account_pending_review: 'Account pending review',
  account_approved: 'Account approved',
  account_rejected: 'Account rejected',
};

// Who a given notification type is aimed at — lets an admin answer
// "did approvers / tenants actually receive it?" at a glance.
function audienceFor(type: string | null): { label: string; className: string } {
  switch (type) {
    case 'new_permit':
    case 'approval_required':
    case 'forwarded':
    case 'sla_warning':
    case 'sla_breach':
      return { label: 'Approver', className: 'bg-blue-500/10 text-blue-600' };
    case 'approved':
    case 'rejected':
    case 'rework':
    case 'closed':
    case 'status_update':
    case 'account_approved':
    case 'account_rejected':
      return { label: 'Tenant', className: 'bg-purple-500/10 text-purple-600' };
    case 'account_pending_review':
      return { label: 'Admin', className: 'bg-amber-500/10 text-amber-600' };
    default:
      return { label: '—', className: '' };
  }
}

export default function EmailDeliveryLog() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [recipient, setRecipient] = useState('');
  const [permitNo, setPermitNo] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: logs, isLoading } = useEmailDeliveryLogs({
    status: statusFilter,
    notificationType: typeFilter,
    recipient: recipient || undefined,
    permitNo: permitNo || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const stats = useMemo(() => {
    const total = logs?.length ?? 0;
    const sent = logs?.filter((l) => l.status === 'sent').length ?? 0;
    const failed = total - sent;
    return { total, sent, failed };
  }, [logs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Email Delivery Log</h1>
        <p className="text-muted-foreground">
          Every notification the system attempts to send — verify that tenants and approvers
          are actually receiving their emails, and spot failures.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Mail className="h-8 w-8 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total (shown)</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <div>
              <div className="text-2xl font-bold text-success">{stats.sent}</div>
              <div className="text-xs text-muted-foreground">Sent</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <XCircle className="h-8 w-8 text-destructive" />
            <div>
              <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Notification type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Recipient email…"
              className="w-full sm:w-[220px]"
            />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full sm:w-[160px]"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full sm:w-[160px]"
            />
            <Input
              value={permitNo}
              onChange={(e) => setPermitNo(e.target.value)}
              placeholder="Permit no…"
              className="w-full sm:w-[180px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !logs?.length ? (
            <p className="text-muted-foreground p-6 text-center">No email deliveries found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date &amp; Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Permit</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const audience = audienceFor(log.notification_type);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          {log.status === 'sent' ? (
                            <Badge variant="outline" className="bg-success/10 text-success">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Sent
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              Failed
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.notification_type
                            ? typeLabels[log.notification_type] ?? log.notification_type
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {audience.label !== '—' ? (
                            <Badge variant="outline" className={audience.className}>{audience.label}</Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-[240px]">
                          <div className="truncate" title={(log.recipients ?? []).join(', ')}>
                            {(log.recipients ?? []).join(', ') || '—'}
                          </div>
                          {log.recipient_count > 1 && (
                            <span className="text-xs text-muted-foreground">
                              {log.recipient_count} recipients
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-medium whitespace-nowrap">
                          {log.permit_no || '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[280px]">
                          {log.status === 'failed' && log.error_message ? (
                            <span className="text-destructive break-words">{log.error_message}</span>
                          ) : (
                            <span className="truncate block" title={log.subject ?? ''}>
                              {log.subject || '—'}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
