import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAdhocCandidates, useRequestAdditionalApproval } from '@/hooks/useAdhocApprovals';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  permitId: string;
  permitNo: string;
}

export function RequestApprovalDialog({ open, onOpenChange, permitId, permitNo }: Props) {
  const { data: candidates = [], isLoading } = useAdhocCandidates(permitId, open);
  const request = useRequestAdditionalApproval();
  const { user, profile } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const submit = async () => {
    if (!selected) return;
    const cand = candidates.find((c) => c.user_id === selected);
    await request.mutateAsync({ permitId, permitNo, targetUserId: selected, targetEmail: cand?.email ?? null,
      requesterName: profile?.full_name ?? user?.email ?? null, note });
    setSelected(null);
    setNote('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request approval</DialogTitle>
          <DialogDescription>
            Ask another approver to sign off on {permitNo} before you decide. Your step stays on hold until they respond.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Approver</Label>
            <Command className="border rounded-md">
              <CommandInput placeholder="Search by name, email or role…" />
              <CommandList className="max-h-60">
                {isLoading ? (
                  <div className="p-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : (
                  <>
                    <CommandEmpty>No eligible approvers found.</CommandEmpty>
                    <CommandGroup>
                      {candidates.map((c) => (
                        <CommandItem
                          key={c.user_id}
                          value={`${c.full_name ?? ''} ${c.email ?? ''} ${c.role_label}`}
                          onSelect={() => setSelected(c.user_id)}
                        >
                          <Check className={cn('mr-2 h-4 w-4', selected === c.user_id ? 'opacity-100' : 'opacity-0')} />
                          <div className="min-w-0">
                            <p className="text-sm truncate">{c.full_name || c.email}</p>
                            <p className="text-xs text-muted-foreground truncate">{c.role_label} · {c.email}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </div>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500}
              placeholder="What should they check?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!selected || request.isPending}>
            {request.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
