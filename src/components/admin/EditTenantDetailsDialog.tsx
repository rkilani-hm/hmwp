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
import { Loader2, Save } from 'lucide-react';
import {
  useUpdateTenantProfile,
  type PendingTenant,
} from '@/hooks/usePendingTenants';

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
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [unit, setUnit] = useState('');
  const [floor, setFloor] = useState('');

  // Reset form whenever a different tenant is loaded
  useEffect(() => {
    if (tenant) {
      setFullName(tenant.full_name || '');
      setPhone(tenant.phone || '');
      setCompanyName(tenant.company_name || '');
      setUnit(tenant.unit || '');
      setFloor(tenant.floor || '');
    }
  }, [tenant]);

  const handleSave = () => {
    if (!tenant) return;
    update.mutate(
      {
        tenantId: tenant.id,
        patch: {
          full_name: fullName,
          phone,
          company_name: companyName,
          unit,
          floor,
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-unit">Unit</Label>
              <Input
                id="edit-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. 1205"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-floor">Floor</Label>
              <Input
                id="edit-floor"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                placeholder="e.g. 12"
              />
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
