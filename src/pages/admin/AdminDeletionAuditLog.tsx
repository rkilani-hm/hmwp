import { useState } from 'react';
import { useAdminDeletionLogs } from '@/hooks/useAdminDeletionLogs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

const actionLabels: Record<string, string> = {
  archived: 'Archived',
  restored: 'Restored',
  permanently_deleted: 'Permanently Deleted',
};

const actionColors: Record<string, string> = {
  archived: 'bg-warning/10 text-warning',
  restored: 'bg-success/10 text-success',
  permanently_deleted: 'bg-destructive/10 text-destructive',
};

const actionIcons: Record<string, typeof Archive> = {
  archived: Archive,
  restored: RotateCcw,
  permanently_deleted: Trash2,
};

export default function AdminDeletionAuditLog() {
  const [actionFilter, setActionFilter] = useState('all');
  const [recordTypeFilter, setRecordTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: logs, isLoading } = useAdminDeletionLogs({
    actionType: actionFilter,
    recordType: recordTypeFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Deletion Audit Log</h1>
        <p className="text-muted-foreground">Track all archive, restore, and permanent delete actions performed by admins.</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Action Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="restored">Restored</SelectItem>
                <SelectItem value="permanently_deleted">Permanently Deleted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={recordTypeFilter} onValueChange={setRecordTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Record Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="work_permit">Work Permits</SelectItem>
                <SelectItem value="gate_pass">Gate Passes</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              placeholder="From"
              className="w-full sm:w-[160px]"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              placeholder="To"
              className="w-full sm:w-[160px]"
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
            <p className="text-muted-foreground p-6 text-center">No audit logs found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Record Type</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Performed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => {
                    const ActionIcon = actionIcons[log.action] || Trash2;
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={actionColors[log.action] || ''}>
                            <ActionIcon className="h-3 w-3 mr-1" />
                            {actionLabels[log.action] || log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {log.record_type === 'work_permit' ? 'Work Permit' : 'Gate Pass'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{log.record_identifier}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{log.record_details || '—'}</TableCell>
                        <TableCell className="text-sm">
                          <div>{log.performed_by_name}</div>
                          <div className="text-xs text-muted-foreground">{log.performed_by_email}</div>
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
