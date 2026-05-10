import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useUpdateUserProfile } from '@/hooks/useUserManagement';
import type { UserWithRoles } from '@/hooks/useAdmin';

interface EditUserDialogProps {
  user: UserWithRoles | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Admin-side edit dialog for a user's profile fields.
 * Editable: full_name, phone, company_name.
 * NOT editable here: email (requires auth-side change flow), roles
 * (existing role chips on the table handle that), is_active (toggle
 * stays as a row switch).
 */
export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const update = useUpdateUserProfile();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');

  // Reset form when the user prop changes (different row clicked)
  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? '');
      setPhone(user.phone ?? '');
      setCompanyName(user.company_name ?? '');
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    update.mutate(
      {
        userId: user.id,
        fullName: fullName.trim() || null,
        phone: phone.trim() || null,
        companyName: companyName.trim() || null,
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user profile</DialogTitle>
          <DialogDescription>
            {user?.email
              ? `Update profile fields for ${user.email}.`
              : 'Update profile fields.'}
            <br />
            Email and roles are managed separately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-full-name">Full name</Label>
            <Input
              id="edit-full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+965 ..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-company">Company</Label>
            <Input
              id="edit-company"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Corp"
            />
            <p className="text-xs text-muted-foreground">
              Typed company name will be auto-linked to an existing company
              entry (case-insensitive) or a new one will be created.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
