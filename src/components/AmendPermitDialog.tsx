import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, CalendarClock, IdCard, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { useRequestAmendment } from '@/hooks/usePermitAmendments';

/**
 * Request a post-approval amendment on an already-approved permit:
 *  - Extend the schedule (new end date / time), or
 *  - Add extra worker Civil IDs.
 * Goes to Health & Safety for a single sign-off.
 */
export function AmendPermitDialog({ permitId, currentDateTo, currentTimeTo }: {
  permitId: string;
  currentDateTo?: string | null;
  currentTimeTo?: string | null;
}) {
  const request = useRequestAmendment();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'extend' | 'add_ids'>('extend');
  const [newDate, setNewDate] = useState((currentDateTo ?? '').slice(0, 10));
  const [newTime, setNewTime] = useState((currentTimeTo ?? '').slice(0, 5));
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const reset = () => {
    setTab('extend'); setNewDate((currentDateTo ?? '').slice(0, 10));
    setNewTime((currentTimeTo ?? '').slice(0, 5)); setReason(''); setFiles([]);
  };

  const submit = () => {
    if (tab === 'extend') {
      if (!newDate && !newTime) { toast.error('Enter a new end date or time'); return; }
      const oldD = (currentDateTo ?? '').slice(0, 10);
      if (newDate && oldD && newDate < oldD) { toast.error('New end date cannot be earlier than the current one'); return; }
      request.mutate(
        { permitId, type: 'extend', reason, oldDateTo: oldD || undefined,
          oldTimeTo: (currentTimeTo ?? '').slice(0, 5) || undefined, newDateTo: newDate || undefined, newTimeTo: newTime || undefined },
        { onSuccess: () => { reset(); setOpen(false); } },
      );
    } else {
      if (!files.length) { toast.error('Add at least one Civil ID file'); return; }
      request.mutate(
        { permitId, type: 'add_ids', reason, files },
        { onSuccess: () => { reset(); setOpen(false); } },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <PencilLine className="h-4 w-4" />
          Request amendment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Amend approved permit</DialogTitle>
          <DialogDescription>
            Extend the schedule or add worker IDs. This goes to Health &amp; Safety for approval; once
            approved, the PDF is re-issued to the tenant and helpdesk.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'extend' | 'add_ids')}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="extend" className="gap-1.5"><CalendarClock className="h-4 w-4" />Extend time</TabsTrigger>
            <TabsTrigger value="add_ids" className="gap-1.5"><IdCard className="h-4 w-4" />Add IDs</TabsTrigger>
          </TabsList>

          <TabsContent value="extend" className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Current end: <b>{(currentDateTo ?? '—')} {(currentTimeTo ?? '').slice(0, 5)}</b>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amend-date">New end date</Label>
                <Input id="amend-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amend-time">New end time</Label>
                <Input id="amend-time" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="add_ids" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="amend-files">Worker Civil ID / License files</Label>
              <Input id="amend-files" type="file" accept="image/*,.pdf" multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
              {files.length > 0 && <p className="text-xs text-muted-foreground">{files.length} file(s) selected</p>}
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-1.5">
          <Label htmlFor="amend-reason">Reason <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Textarea id="amend-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this change needed?" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={request.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={request.isPending}>
            {request.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</>) : 'Submit for approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
