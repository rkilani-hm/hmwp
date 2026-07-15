import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, UserPlus, Plus, X, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useInviteTenants } from '@/hooks/useUserManagement';
import { useCompanies } from '@/hooks/useCompanies';

interface Invitee { email: string; fullName: string }

/**
 * Admin action: invite one OR several tenants. Multiple invitees can share the
 * same company (e.g. onboarding a whole contractor/company at once). Each person
 * receives their own invitation to set a password and complete their details.
 */
export function InviteTenantDialog() {
  const invite = useInviteTenants();
  const { data: companies } = useCompanies();
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState('');
  // Existing company matched (case-insensitive) — the new user(s) will join it.
  const companyMatch = company.trim()
    ? companies?.find((c) => c.name.trim().toLowerCase() === company.trim().toLowerCase()) || null
    : null;
  const [rows, setRows] = useState<Invitee[]>([{ email: '', fullName: '' }]);
  const [results, setResults] = useState<{ email: string; ok: boolean; error?: string }[] | null>(null);

  const reset = () => { setCompany(''); setRows([{ email: '', fullName: '' }]); setResults(null); };

  const update = (i: number, f: keyof Invitee, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [f]: v } : row)));
  const addRow = () => setRows((r) => [...r, { email: '', fullName: '' }]);
  const removeRow = (i: number) => setRows((r) => (r.length <= 1 ? r : r.filter((_, idx) => idx !== i)));

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSend = () => {
    const invitees = rows
      .map((r) => ({ email: r.email.trim(), fullName: r.fullName.trim() }))
      .filter((r) => r.email !== '');
    if (invitees.length === 0) { toast.error('Add at least one email'); return; }
    const bad = invitees.find((r) => !emailRe.test(r.email));
    if (bad) { toast.error(`Invalid email: ${bad.email}`); return; }
    // Dedupe emails within the batch.
    const seen = new Set<string>();
    const deduped = invitees.filter((r) => {
      const k = r.email.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    invite.mutate(
      { companyName: company, invitees: deduped },
      { onSuccess: (res) => setResults(res) },
    );
  };

  const allSucceeded = results?.every((r) => r.ok);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite Tenant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Invite tenant{rows.length > 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            Invite one or more people. Everyone here shares the company below and gets their own
            email to set a password and complete their details.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          // ---- Results view ----
          <div className="space-y-2 py-1">
            {results.map((r) => (
              <div key={r.email} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                {r.ok
                  ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                <span className="font-medium">{r.email}</span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {r.ok ? 'Invitation sent' : (r.error || 'Failed')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          // ---- Entry view ----
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="inv-company">Company <span className="text-muted-foreground text-xs">(shared, optional)</span></Label>
              <Input id="inv-company" value={company} placeholder="Start typing to pick an existing company…"
                list="invite-companies" autoComplete="off"
                onChange={(e) => setCompany(e.target.value)} />
              <datalist id="invite-companies">
                {(companies ?? []).map((c) => (
                  <option key={c.id} value={c.name}>{`${c.user_count} user(s)`}</option>
                ))}
              </datalist>
              {company.trim() && (
                companyMatch ? (
                  <p className="text-xs text-success">
                    Joining existing company “{companyMatch.name}” · {companyMatch.user_count} user(s) already
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">New company — it will be created</p>
                )
              )}
            </div>

            <div className="space-y-2">
              <Label>People to invite</Label>
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input type="email" placeholder="email@company.com" value={row.email}
                    onChange={(e) => update(i, 'email', e.target.value)} className="flex-1" />
                  <Input placeholder="Name (optional)" value={row.fullName}
                    onChange={(e) => update(i, 'fullName', e.target.value)} className="w-40 shrink-0" />
                  {rows.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground"
                      onClick={() => removeRow(i)} aria-label="Remove"><X className="h-4 w-4" /></Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
                <Plus className="h-4 w-4 mr-1.5" />Add another person
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Each person fills in anything you leave blank when they accept their invitation.
            </p>
          </div>
        )}

        <DialogFooter>
          {results ? (
            <>
              {!allSucceeded && (
                <Button variant="outline" onClick={() => setResults(null)}>Back</Button>
              )}
              <Button onClick={() => { setOpen(false); reset(); }}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={invite.isPending}>Cancel</Button>
              <Button onClick={handleSend} disabled={invite.isPending || rows.every((r) => !r.email.trim())}>
                {invite.isPending
                  ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>)
                  : `Send invitation${rows.filter((r) => r.email.trim()).length > 1 ? 's' : ''}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
