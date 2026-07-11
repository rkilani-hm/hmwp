import { useState } from 'react';
import { usePendingAmendments, useResolveAmendment, useCanApproveAmendment } from '@/hooks/usePermitAmendments';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarClock, IdCard, Check, X } from 'lucide-react';
import { format } from 'date-fns';

/**
 * Health & Safety / admin queue for post-approval amendments. Approving applies
 * the change, re-issues the PDF, and re-emails the tenant + helpdesk.
 */
export default function PermitAmendments() {
  const { data: rows, isLoading } = usePendingAmendments();
  const { data: canApprove } = useCanApproveAmendment();
  const resolve = useResolveAmendment();
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = (amendmentId: string, approve: boolean) => {
    setBusyId(amendmentId);
    resolve.mutate({ amendmentId, approve }, { onSettled: () => setBusyId(null) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Permit Amendments</h1>
        <p className="text-muted-foreground">
          Post-approval changes awaiting Health &amp; Safety sign-off — extensions and added worker IDs.
        </p>
      </div>

      {!canApprove && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">
          You can view the queue, but only Health &amp; Safety / admins can approve amendments.
        </CardContent></Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !rows?.length ? (
            <p className="text-muted-foreground p-6 text-center">No pending amendments.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Permit</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Requested by</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {a.work_permits?.permit_no || '—'}
                        <div className="text-xs text-muted-foreground">{a.work_permits?.requester_name}</div>
                      </TableCell>
                      <TableCell>
                        {a.amendment_type === 'extend' ? (
                          <Badge variant="outline" className="gap-1"><CalendarClock className="h-3 w-3" />Extend</Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1"><IdCard className="h-3 w-3" />Add IDs</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.amendment_type === 'extend' ? (
                          <span>
                            to <b>{a.new_date_to || '—'}{a.new_time_to ? ` ${a.new_time_to.slice(0, 5)}` : ''}</b>
                            <span className="text-muted-foreground"> (was {a.old_date_to || '—'}{a.old_time_to ? ` ${a.old_time_to.slice(0, 5)}` : ''})</span>
                          </span>
                        ) : (
                          <span><b>{a.added_id_count ?? 0}</b> worker ID(s)</span>
                        )}
                        {a.reason && <div className="text-xs text-muted-foreground italic">“{a.reason}”</div>}
                      </TableCell>
                      <TableCell className="text-sm">{a.requested_by_name || '—'}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{format(new Date(a.created_at), 'dd MMM HH:mm')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={!canApprove || busyId === a.id}
                            onClick={() => act(a.id, false)} className="text-destructive">
                            {busyId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                          </Button>
                          <Button size="sm" disabled={!canApprove || busyId === a.id} onClick={() => act(a.id, true)}>
                            {busyId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                            Approve
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
