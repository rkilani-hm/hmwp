import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { UserWithRoles } from '@/hooks/useAdmin';
import { ActivationRow, useUserActivation } from '@/hooks/useUserActivation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type TypeFilter = 'all' | 'tenants' | 'staff';
type StatusFilter = 'all' | 'active' | 'invitation_sent' | 'invitation_expired' | 'disabled';

// Same classification as the User Management tabs: a user whose only
// role is "tenant" counts as a tenant; anyone with any other role is staff.
function isTenantOnly(user: UserWithRoles): boolean {
  return user.roles.length > 0 && user.roles.every((r) => r === 'tenant');
}

// Single source of truth for a user's account status — used by both the
// filter and the Status column so they can never diverge.
function userStatusLabel(user: UserWithRoles, act: ActivationRow | undefined): string {
  if (!user.is_active) return 'Disabled';
  if (act?.activated) return 'Active';
  if (act?.invite_expired) return 'Invitation expired';
  if (act) return 'Invitation sent';
  return 'Active';
}

// Maps each non-"all" status filter value to its display label.
const STATUS_LABELS: Record<Exclude<StatusFilter, 'all'>, string> = {
  active: 'Active',
  invitation_sent: 'Invitation sent',
  invitation_expired: 'Invitation expired',
  disabled: 'Disabled',
};

interface ExportUsersDialogProps {
  users: UserWithRoles[];
  roleLabels: Record<string, string>;
  activation?: Record<string, ActivationRow>;
}

export function ExportUsersDialog({ users, roleLabels, activation: activationProp }: ExportUsersDialogProps) {
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [exporting, setExporting] = useState(false);

  // Derive each user's real status from the activation records.
  const { data: hookActivation } = useUserActivation();
  const activation = hookActivation ?? activationProp;

  const matchingUsers = useMemo(() => {
    return users.filter((user) => {
      if (typeFilter === 'tenants' && !isTenantOnly(user)) return false;
      if (typeFilter === 'staff' && isTenantOnly(user)) return false;
      if (statusFilter !== 'all') {
        const label = userStatusLabel(user, activation?.[user.id]);
        if (label !== STATUS_LABELS[statusFilter]) return false;
      }
      return true;
    });
  }, [users, typeFilter, statusFilter, activation]);

  const handleExport = () => {
    if (matchingUsers.length === 0) {
      toast.error('No users match the selected filters');
      return;
    }
    setExporting(true);
    try {
      const formatDate = (value: string | null | undefined) =>
        value ? new Date(value).toLocaleString() : '';

      const rows = matchingUsers.map((user) => {
        const act = activation?.[user.id];
        return {
          'Full Name': user.full_name || '',
          Email: user.email,
          Company: user.company_name || '',
          Phone: user.phone || '',
          Type: isTenantOnly(user) ? 'Tenant' : 'Staff',
          Roles: user.roles.map((r) => roleLabels[r] || r).join(', '),
          Status: userStatusLabel(user, act),
          'Invitation sent': formatDate(act?.invitation_sent_at),
          'Last sign-in': formatDate(act?.last_sign_in_at),
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      // Reasonable column widths so the file opens readable.
      worksheet['!cols'] = [
        { wch: 28 }, // Full Name
        { wch: 34 }, // Email
        { wch: 28 }, // Company
        { wch: 18 }, // Phone
        { wch: 10 }, // Type
        { wch: 36 }, // Roles
        { wch: 18 }, // Status
        { wch: 22 }, // Invitation sent
        { wch: 22 }, // Last sign-in
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');

      const typePart = typeFilter === 'all' ? 'all-users' : typeFilter;
      const statusPart = statusFilter === 'all' ? '' : `-${statusFilter.replace(/_/g, '-')}`;
      const datePart = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `users-${typePart}${statusPart}-${datePart}.xlsx`);

      toast.success(`Exported ${matchingUsers.length} user${matchingUsers.length > 1 ? 's' : ''} to Excel`);
      setOpen(false);
    } catch (e: any) {
      toast.error('Failed to create the Excel file: ' + (e?.message || 'unknown error'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export to Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export users to Excel</DialogTitle>
          <DialogDescription>
            Choose which users to include. The file downloads as an .xlsx you can open in Excel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="export-type">User type</Label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger id="export-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="tenants">Tenants only</SelectItem>
                <SelectItem value="staff">Staff only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="export-status">Account status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger id="export-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="invitation_sent">Invitation sent only</SelectItem>
                <SelectItem value="invitation_expired">Invitation expired only</SelectItem>
                <SelectItem value="disabled">Disabled only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-sm text-muted-foreground">
            {matchingUsers.length} user{matchingUsers.length === 1 ? '' : 's'} will be included.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting || matchingUsers.length === 0}>
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Download Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
