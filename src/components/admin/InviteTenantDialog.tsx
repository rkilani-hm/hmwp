import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useInviteTenant } from '@/hooks/useUserManagement';

/**
 * Admin action: invite a tenant by email. The tenant receives an invitation
 * link to set a password and complete their own onboarding details.
 */
export function InviteTenantDialog() {
  const invite = useInviteTenant();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');

  const reset = () => { setEmail(''); setFullName(''); setCompany(''); };

  const handleInvite = () => {
    const e = email.trim();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast.error('Enter a valid email address');
      return;
    }
    invite.mutate(
      { email: e, fullName, companyName: company },
      { onSuccess: () => { reset(); setOpen(false); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite Tenant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Invite a tenant
          </DialogTitle>
          <DialogDescription>
            The tenant receives an email invitation to set their password and complete
            their own details (company, phone, units). No password is set by you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">Email <span className="text-destructive">*</span></Label>
            <Input id="inv-email" type="email" value={email} placeholder="tenant@company.com"
              onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-name">Full name <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input id="inv-name" value={fullName} placeholder="Jane Doe"
              onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-company">Company <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input id="inv-company" value={company} placeholder="Acme Trading Co."
              onChange={(e) => setCompany(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            They'll fill in anything you leave blank when they accept the invitation.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={invite.isPending}>Cancel</Button>
          <Button onClick={handleInvite} disabled={invite.isPending || !email.trim()}>
            {invite.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>) : 'Send invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
