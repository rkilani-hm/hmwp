import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Plus, X } from 'lucide-react';
import {
  useUpdateTenantProfile,
  type PendingTenant,
} from '@/hooks/usePendingTenants';
import {
  useTenantUnits,
  useAddTenantUnit,
  useDeleteTenantUnit,
  formatUnit,
} from '@/hooks/useTenantUnits';

interface Props {
  tenant: PendingTenant | null;
  onClose: () => void;
}

/**
 * Admin-only dialog: edit a pending tenant's profile fields before
 * approval. Lets the admin fix missing or wrong data (typo'd phone,
 * blank unit, etc.) without making the tenant re-register.
 *
 * Email is shown read-only — it's the auth identity, and changing it
 * would require admin-create-user style flow. Everything else is
 * editable; empty fields become NULL on save.
 *
 * Open state is controlled by the parent: passing `tenant={null}`
 * closes the dialog. Form state is local; it resets when the tenant
 * prop changes so opening different tenants doesn't carry over
 * unsaved edits.
 */
export function EditTenantDetailsDialog({ tenant, onClose }: Props) {
  const update = useUpdateTenantProfile();
  const { data: units } = useTenantUnits(tenant?.id);
  const addUnit = useAddTenantUnit();
  const deleteUnit = useDeleteTenantUnit();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  // New-unit entry row for the units manager.
  const [newUnit, setNewUnit] = useState('');
  const [newFloor, setNewFloor] = useState('');

  // Reset form whenever a different tenant is loaded
  useEffect(() => {
    if (tenant) {
      setFullName(tenant.full_name || '');
      setPhone(tenant.phone || '');
      setCompanyName(tenant.company_name || '');
      setNewUnit('');
      setNewFloor('');
    }
  }, [tenant]);

  const handleAddUnit = () => {
    if (!tenant || !newUnit.trim()) return;
    addUnit.mutate(
      { tenantId: tenant.id, unit: newUnit, floor: newFloor },
      {
        onSuccess: () => {
          setNewUnit('');
          setNewFloor('');
        },
      },
    );
  };

  const handleSave = () => {
    if (!tenant) return;
    // Keep the profile's primary unit/floor mirror in sync with the first
    // registered unit (used as the default in the permit/gate-pass wizards).
    const primary = units && units.length > 0 ? units[0] : null;
    update.mutate(
      {
        tenantId: tenant.id,
        patch: {
          full_name: fullName,
          phone,
          company_name: companyName,
          unit: primary?.unit ?? '',
          floor: primary?.floor ?? '',
        },
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open={!!tenant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit tenant details</DialogTitle>
          <DialogDescription>
            Fix any missing or incorrect information before approving this
            tenant. Changes are saved immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-email">Email (read-only)</Label>
            <Input id="edit-email" value={tenant?.email || ''} disabled />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Full name</Label>
            <Input
              id="edit-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Mohammad Salim Makrani"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-phone">Phone / Mobile</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+965 1234 5678"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-company">Company name</Label>
            <Input
              id="edit-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Trading Co."
            />
          </div>

          {/* Units manager. A tenant may occupy several units; each is
              selectable when they create a permit or gate pass. Add/remove
              are saved immediately. The first unit is mirrored to the
              profile's primary unit on Save. */}
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
                      onClick={() => deleteUnit.mutate({ id: u.id, tenantId: tenant!.id })}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
