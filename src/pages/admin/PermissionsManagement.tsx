import { useState, useMemo } from 'react';
import { useRoles } from '@/hooks/useRoles';
import { usePermissions, useAllRolePermissions, useToggleRolePermission, useCreatePermission, useDeletePermission } from '@/hooks/usePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function PermissionsManagement() {
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: permissions, isLoading: permissionsLoading } = usePermissions();
  const { data: rolePermissions, isLoading: rpLoading } = useAllRolePermissions();
  const togglePermission = useToggleRolePermission();
  const createPermission = useCreatePermission();
  const deletePermission = useDeletePermission();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPermission, setNewPermission] = useState({ name: '', label: '', description: '', category: 'general' });

  const activeRoles = useMemo(() => roles?.filter(r => r.is_active) || [], [roles]);

  const permissionsByCategory = useMemo(() => {
    if (!permissions) return {};
    return permissions.reduce((acc, perm) => {
      if (!acc[perm.category]) acc[perm.category] = [];
      acc[perm.category].push(perm);
      return acc;
    }, {} as Record<string, typeof permissions>);
  }, [permissions]);

  const hasPermission = (roleId: string, permissionId: string) => {
    return rolePermissions?.some(rp => rp.role_id === roleId && rp.permission_id === permissionId) || false;
  };

  const handleToggle = (roleId: string, permissionId: string) => {
    const has = hasPermission(roleId, permissionId);
    togglePermission.mutate({ roleId, permissionId, hasPermission: has });
  };

  const handleCreate = () => {
    if (!newPermission.name || !newPermission.label) return;
    createPermission.mutate(newPermission, {
      onSuccess: () => {
        setCreateDialogOpen(false);
        setNewPermission({ name: '', label: '', description: '', category: 'general' });
      },
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete permission "${name}"? This will remove it from all roles.`)) {
      deletePermission.mutate(id);
    }
  };

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    permits: 'Permits',
    admin: 'Administration',
    general: 'General',
  };

  if (rolesLoading || permissionsLoading || rpLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Permissions Management</h1>
          <p className="text-muted-foreground">Configure which features each role can access</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Permission
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Permission</DialogTitle>
              <DialogDescription>Add a new permission that can be assigned to roles</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="perm-name">Name (identifier)</Label>
                <Input
                  id="perm-name"
                  placeholder="e.g., view_reports"
                  value={newPermission.name}
                  onChange={(e) => setNewPermission({ ...newPermission, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="perm-label">Label</Label>
                <Input
                  id="perm-label"
                  placeholder="e.g., View Reports"
                  value={newPermission.label}
                  onChange={(e) => setNewPermission({ ...newPermission, label: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="perm-desc">Description</Label>
                <Input
                  id="perm-desc"
                  placeholder="What this permission allows"
                  value={newPermission.description}
                  onChange={(e) => setNewPermission({ ...newPermission, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="perm-category">Category</Label>
                <Select
                  value={newPermission.category}
                  onValueChange={(value) => setNewPermission({ ...newPermission, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="navigation">Navigation</SelectItem>
                    <SelectItem value="permits">Permits</SelectItem>
                    <SelectItem value="admin">Administration</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createPermission.isPending}>
                {createPermission.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Role Permissions Matrix
          </CardTitle>
          <CardDescription>
            Check the boxes to grant permissions to each role. Changes are saved automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Permission</TableHead>
                  {activeRoles.map((role) => (
                    <TableHead key={role.id} className="text-center min-w-[100px]">
                      {role.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(permissionsByCategory).map(([category, perms]) => (
                  <>
                    <TableRow key={category} className="bg-muted/50">
                      <TableCell colSpan={activeRoles.length + 2} className="font-semibold">
                        <Badge variant="outline">{categoryLabels[category] || category}</Badge>
                      </TableCell>
                    </TableRow>
                    {perms.map((permission) => (
                      <TableRow key={permission.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{permission.label}</div>
                            {permission.description && (
                              <div className="text-sm text-muted-foreground">{permission.description}</div>
                            )}
                          </div>
                        </TableCell>
                        {activeRoles.map((role) => (
                          <TableCell key={role.id} className="text-center">
                            <Checkbox
                              checked={hasPermission(role.id, permission.id)}
                              onCheckedChange={() => handleToggle(role.id, permission.id)}
                              disabled={togglePermission.isPending}
                            />
                          </TableCell>
                        ))}
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(permission.id, permission.label)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
