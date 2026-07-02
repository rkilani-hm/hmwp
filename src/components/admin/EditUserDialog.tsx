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
import { Loader2, AlertTriangle, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeKuwaitPhone } from '@/lib/validation/phone';
import { useUpdateUserProfile } from '@/hooks/useUserManagement';
import { useDepartments } from '@/hooks/useDepartments';
import {
  useTenantUnits,
  useAddTenantUnit,
  useDeleteTenantUnit,
  formatUnit,
} from '@/hooks/useTenantUnits';
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

  // Tenant units — a tenant may occupy several units, each selectable when
  // they create a permit or gate pass. Managed here for tenant accounts only.
  const { data: units } = useTenantUnits(user?.id);
  const addUnit = useAddTenantUnit();
  const deleteUnit = useDeleteTenantUnit();
  const [newUnit, setNewUnit] = useState('');
  const [newFloor, setNewFloor] = useState('');

  const handleAddUnit = () => {
    if (!user || !newUnit.trim()) return;
    addUnit.mutate(
      { tenantId: user.id, unit: newUnit, floor: newFloor },
      {
        onSuccess: () => {
          setNewUnit('');
          setNewFloor('');
        },
      },
    );
  };

  // Reset form when the user prop changes (different row clicked)
  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? '');
      setPhone(user.phone ?? '');
      setCompanyName(user.company_name ?? '');
      setDepartmentId(user.department_id ?? NO_DEPARTMENT);
      setActorType(user.actor_type ?? 'approver');
      setNewUnit('');
      setNewFloor('');
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

          {/* Department + Actor type are INTERNAL-staff concepts only. Tenants
              get neither (a DB trigger also nulls department_id for tenant-role
              users, and actor_type is irrelevant since tenants never act on a
              workflow step). */}
          {isInternal ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="edit-department">Department</Label>
                  {isUnassignedInternal && (
                    <Badge variant="outline" className="gap-1 border-warning/40 text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      Unassigned
                    </Badge>
                  )}
                </div>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger id="edit-department">
                    <SelectValue placeholder="No department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isUnassignedInternal && (
                  <p className="text-xs text-warning">
                    This internal user has no department assigned. Assign one to
                    complete their setup.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Actor type</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={actorType}
                  onValueChange={(v) => {
                    if (v === 'approver' || v === 'reviewer') setActorType(v);
                  }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="approver" className="px-4">Approver</ToggleGroupItem>
                  <ToggleGroupItem value="reviewer" className="px-4">Reviewer</ToggleGroupItem>
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">
                  Controls the displayed verb only (Approve/Approved vs
                  Review/Reviewed). Both have identical workflow authority.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Department &amp; actor type</Label>
                <p className="text-xs text-muted-foreground">
                  Only apply to internal staff — not tenant accounts.
                </p>
              </div>

              {/* Units manager — tenant accounts only. Each unit is selectable
                  when the tenant creates a permit or gate pass. Add/remove are
                  saved immediately. */}
              <div className="space-y-2">
                <Label>Units</Label>
                {units && units.length > 0 ? (
                  <div className="space-y-1.5">
                    {units.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
                      >
                        <span>{formatUnit(u)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => user && deleteUnit.mutate({ id: u.id, tenantId: user.id })}
                          disabled={deleteUnit.isPending}
                          aria-label={`Remove ${formatUnit(u)}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No units registered yet.</p>
                )}
                <div className="flex gap-2 pt-1">
                  <Input
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="Unit e.g. 1205"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddUnit();
                      }
                    }}
                  />
                  <Input
                    value={newFloor}
                    onChange={(e) => setNewFloor(e.target.value)}
                    placeholder="Floor"
                    className="w-24 shrink-0"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddUnit();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={handleAddUnit}
                    disabled={addUnit.isPending || !newUnit.trim()}
                    aria-label="Add unit"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}

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
