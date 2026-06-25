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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeKuwaitPhone } from '@/lib/validation/phone';
import { useUpdateUserProfile } from '@/hooks/useUserManagement';
import { useDepartments } from '@/hooks/useDepartments';
import type { UserWithRoles } from '@/hooks/useAdmin';

// Sentinel for the "no department" option (Radix Select can't use "" as a
// value). Mapped to/from NULL at the persistence boundary.
const NO_DEPARTMENT = '__none__';

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
  const { data: departments = [] } = useDepartments();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [departmentId, setDepartmentId] = useState<string>(NO_DEPARTMENT);
  const [actorType, setActorType] = useState<'approver' | 'reviewer'>('approver');

  // A user is INTERNAL (non-tenant) if they hold any role other than
  // 'tenant'. Internal users are expected to be assigned a department;
  // we flag those without one so the admin can complete assignment (E1).
  const isInternal = !!user && (user.roles ?? []).some((r) => r !== 'tenant');
  const isUnassignedInternal = isInternal && departmentId === NO_DEPARTMENT;

  // Reset form when the user prop changes (different row clicked)
  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? '');
      setPhone(user.phone ?? '');
      setCompanyName(user.company_name ?? '');
      setDepartmentId(user.department_id ?? NO_DEPARTMENT);
      setActorType(user.actor_type ?? 'approver');
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmedPhone = phone.trim();
    let normalizedPhone: string | null = null;
    if (trimmedPhone) {
      const n = normalizeKuwaitPhone(trimmedPhone);
      if (!n) {
        toast.error('Enter a valid Kuwaiti mobile number (8 digits, e.g. 66001030)');
        return;
      }
      normalizedPhone = n;
    }

    update.mutate(
      {
        userId: user.id,
        fullName: fullName.trim() || null,
        phone: normalizedPhone,
        companyName: companyName.trim() || null,
        // Tenants are never assigned a department; for internal users the
        // NO_DEPARTMENT sentinel maps back to NULL (clearing the link).
        // (A DB trigger also enforces tenant -> NULL as defense in depth.)
        departmentId: !isInternal || departmentId === NO_DEPARTMENT ? null : departmentId,
        actorType,
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

          {/* Department — internal staff only. Tenants are never assigned a
              department (the selector is hidden for them, and a DB trigger
              enforces it). Internal users with no department are flagged so
              admins can complete assignment (spec E1). */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="edit-department">Department</Label>
              {isUnassignedInternal && (
                <Badge
                  variant="outline"
                  className="gap-1 border-warning/40 text-warning"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Unassigned
                </Badge>
              )}
            </div>
            {isInternal ? (
              <>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger id="edit-department">
                    <SelectValue placeholder="No department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isUnassignedInternal && (
                  <p className="text-xs text-warning">
                    This internal user has no department assigned. Assign one to
                    complete their setup.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Tenants are not assigned to departments.
              </p>
            )}
          </div>

          {/* Actor type — Approver | Reviewer (exactly one). Cosmetic only:
              changes the displayed approve verb, never workflow authority. */}
          <div className="space-y-2">
            <Label>Actor type</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={actorType}
              onValueChange={(v) => {
                // ToggleGroup emits '' if the active item is re-clicked;
                // ignore that so exactly one stays selected.
                if (v === 'approver' || v === 'reviewer') setActorType(v);
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="approver" className="px-4">
                Approver
              </ToggleGroupItem>
              <ToggleGroupItem value="reviewer" className="px-4">
                Reviewer
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              Controls the displayed verb only (Approve/Approved vs
              Review/Reviewed). Both have identical workflow authority.
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
