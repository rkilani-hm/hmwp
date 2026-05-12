import { useState } from 'react';
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole, useRoleUsage, Role } from '@/hooks/useRoles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Shield, Plus, Pencil, Trash2, Lock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

// The 'admin' role is hardcoded throughout the app (hasRole('admin')
// checks, RLS policies). Deleting it would break the application.
// All other roles — even those seeded with is_system=true — can be
// removed if no workflow_steps reference them.
const PROTECTED_ROLE_NAMES = ['admin'] as const;

export default function RolesManagement() {
  const { data: roles, isLoading } = useRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [formData, setFormData] = useState({ name: '', label: '', description: '' });

  // Usage stats for the role currently in the delete dialog. Lazy-
  // loaded — only fires when a role is selected for deletion.
  const { data: usage, isLoading: usageLoading } = useRoleUsage(roleToDelete?.id);

  const handleCreate = () => {
    if (!formData.name || !formData.label) return;
    createRole.mutate(formData, {
      onSuccess: () => {
        setIsCreateDialogOpen(false);
        setFormData({ name: '', label: '', description: '' });
      },
    });
  };

  const handleUpdate = () => {
    if (!selectedRole) return;
    updateRole.mutate(
      { id: selectedRole.id, label: formData.label, description: formData.description },
      {
        onSuccess: () => {
          setIsEditDialogOpen(false);
          setSelectedRole(null);
          setFormData({ name: '', label: '', description: '' });
        },
      }
    );
  };

  const handleToggleActive = (role: Role) => {
    updateRole.mutate({ id: role.id, is_active: !role.is_active });
  };

  // Open the delete confirmation dialog (which fires the usage check).
  const openDeleteDialog = (role: Role) => {
    if (PROTECTED_ROLE_NAMES.includes(role.name as any)) return;
    setRoleToDelete(role);
  };

  const handleConfirmDelete = () => {
    if (!roleToDelete) return;
    deleteRole.mutate(roleToDelete.id, {
      onSuccess: () => setRoleToDelete(null),
    });
  };

  // "Deactivate instead" — fires when admin opts out of full delete.
  // Keeps historical references intact while hiding the role from
  // user assignment + workflow builder dropdowns.
  const handleDeactivateInstead = () => {
    if (!roleToDelete) return;
    updateRole.mutate(
      { id: roleToDelete.id, is_active: false },
      { onSuccess: () => setRoleToDelete(null) },
    );
  };

  const openEditDialog = (role: Role) => {
    setSelectedRole(role);
    setFormData({ name: role.name, label: role.label, description: role.description || '' });
    setIsEditDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Roles Management</h1>
        <p className="text-muted-foreground">
          Create, edit, and manage user roles in the system
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                System Roles
              </CardTitle>
              <CardDescription>
                Manage roles that can be assigned to users. System roles cannot be deleted.
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Role
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Role</DialogTitle>
                  <DialogDescription>
                    Add a new role that can be assigned to users.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Role Name (unique identifier)</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., quality_control"
                    />
                    <p className="text-xs text-muted-foreground">
                      Will be converted to lowercase with underscores
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="label">Display Label</Label>
                    <Input
                      id="label"
                      value={formData.label}
                      onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                      placeholder="e.g., Quality Control"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Describe what this role is used for..."
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!formData.name || !formData.label || createRole.isPending}
                  >
                    {createRole.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Role
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Active</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles?.map((role) => (
                  <TableRow key={role.id} className={!role.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <Switch
                        checked={role.is_active}
                        onCheckedChange={() => handleToggleActive(role)}
                        disabled={updateRole.isPending}
                      />
                    </TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">{role.name}</code>
                    </TableCell>
                    <TableCell className="font-medium">{role.label}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {role.description || '-'}
                    </TableCell>
                    <TableCell>
                      {role.is_system ? (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" />
                          System
                        </Badge>
                      ) : (
                        <Badge variant="outline">Custom</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(role.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(role)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {PROTECTED_ROLE_NAMES.includes(role.name as any) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled
                            title="The admin role cannot be deleted — it's required by the application"
                          >
                            <Lock className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDeleteDialog(role)}
                            disabled={deleteRole.isPending}
                            title="Delete this role"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {roles?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No roles found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Role Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) {
          setSelectedRole(null);
          setFormData({ name: '', label: '', description: '' });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>
              Update the role details. Role name cannot be changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role Name</Label>
              <code className="block text-sm bg-muted px-3 py-2 rounded">{selectedRole?.name}</code>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-label">Display Label</Label>
              <Input
                id="edit-label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!formData.label || updateRole.isPending}
            >
              {updateRole.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete-role confirmation. Shows dependency counts so admin
          understands what's about to break / what's safe. */}
      <AlertDialog
        open={roleToDelete !== null}
        onOpenChange={(open) => !open && setRoleToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete role "{roleToDelete?.label}"?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p>
                  This action cannot be undone. Before confirming, review
                  what currently depends on this role:
                </p>

                {usageLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking dependencies...
                  </div>
                ) : usage ? (
                  <ul className="space-y-1.5 text-sm border-l-2 border-muted pl-3">
                    <li>
                      <strong>{usage.userCount}</strong> user
                      {usage.userCount === 1 ? '' : 's'} currently assigned
                      this role
                      {usage.userCount > 0 && (
                        <span className="text-muted-foreground">
                          {' '}— will be unassigned automatically
                        </span>
                      )}
                    </li>
                    <li>
                      <strong>{usage.workflowStepCount}</strong> active
                      workflow step{usage.workflowStepCount === 1 ? '' : 's'}
                      {' '}reference this role
                      {usage.workflowStepCount > 0 && (
                        <span className="text-destructive font-medium">
                          {' '}— deletion will be blocked until you remove these
                        </span>
                      )}
                    </li>
                    <li>
                      <strong>{usage.permitApprovalCount + usage.gatePassApprovalCount}</strong>
                      {' '}historical approval row
                      {usage.permitApprovalCount + usage.gatePassApprovalCount === 1 ? '' : 's'}
                      {' '}reference this role
                      {(usage.permitApprovalCount + usage.gatePassApprovalCount) > 0 && (
                        <span className="text-muted-foreground">
                          {' '}— role link will be set NULL; rows preserved
                        </span>
                      )}
                    </li>
                  </ul>
                ) : null}

                {usage && usage.workflowStepCount > 0 && (
                  <div className="rounded-md bg-warning/10 border border-warning/30 px-3 py-2 text-sm">
                    <strong>Recommendation:</strong> Edit the workflow
                    templates that use this role first, OR deactivate
                    the role instead of deleting it.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel disabled={deleteRole.isPending || updateRole.isPending}>
              Keep role
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={handleDeactivateInstead}
              disabled={
                deleteRole.isPending ||
                updateRole.isPending ||
                !roleToDelete?.is_active
              }
              title={
                !roleToDelete?.is_active
                  ? 'Role is already inactive'
                  : 'Hide the role from new assignments while preserving history'
              }
            >
              {updateRole.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Deactivate instead
            </Button>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteRole.isPending || updateRole.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRole.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete permanently'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
