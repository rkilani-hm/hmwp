import { useState } from 'react';
import {
  useDepartments,
  useDepartmentMemberCounts,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  Department,
} from '@/hooks/useDepartments';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Building, Plus, Pencil, Trash2, Users, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

/**
 * Departments management (admin-only). Departments are an internal-staff
 * concept used to gate confidential comment visibility; tenants are never
 * assigned one (enforced in the user dialog + a DB trigger).
 */
export default function DepartmentsManagement() {
  const { data: departments, isLoading } = useDepartments();
  const { data: memberCounts = {} } = useDepartmentMemberCounts();
  const createDept = useCreateDepartment();
  const updateDept = useUpdateDepartment();
  const deleteDept = useDeleteDepartment();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selected, setSelected] = useState<Department | null>(null);
  const [deptToDelete, setDeptToDelete] = useState<Department | null>(null);
  const [name, setName] = useState('');

  const handleCreate = () => {
    if (!name.trim()) return;
    createDept.mutate(name, {
      onSuccess: () => { setIsCreateOpen(false); setName(''); },
    });
  };

  const openEdit = (d: Department) => { setSelected(d); setName(d.name); setIsEditOpen(true); };

  const handleUpdate = () => {
    if (!selected || !name.trim()) return;
    updateDept.mutate({ id: selected.id, name }, {
      onSuccess: () => { setIsEditOpen(false); setSelected(null); setName(''); },
    });
  };

  const handleConfirmDelete = () => {
    if (!deptToDelete) return;
    deleteDept.mutate(deptToDelete.id, { onSuccess: () => setDeptToDelete(null) });
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
        <h1 className="text-3xl font-bold tracking-tight">Departments</h1>
        <p className="text-muted-foreground">
          Create and manage departments. Internal staff are assigned to a department;
          tenants are never assigned one.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Departments
              </CardTitle>
              <CardDescription>
                Used to gate confidential comment visibility to members of the same department.
              </CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) setName(''); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Department
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Department</DialogTitle>
                  <DialogDescription>Add a new department.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-4">
                  <Label htmlFor="dept-name">Department Name</Label>
                  <Input
                    id="dept-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., BDCR"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={!name.trim() || createDept.isPending}>
                    {createDept.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create
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
                  <TableHead>Name</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments?.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Users className="h-3 w-3" />
                        {memberCounts[d.id] ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.created_at ? format(new Date(d.created_at), 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => openEdit(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeptToDelete(d)}
                          disabled={deleteDept.isPending}
                          title="Delete this department"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {departments?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No departments yet. Create one to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit department */}
      <Dialog open={isEditOpen} onOpenChange={(o) => { setIsEditOpen(o); if (!o) { setSelected(null); setName(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Department</DialogTitle>
            <DialogDescription>Update the department name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="edit-dept-name">Department Name</Label>
            <Input
              id="edit-dept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!name.trim() || updateDept.isPending}>
              {updateDept.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deptToDelete !== null} onOpenChange={(o) => !o && setDeptToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete department "{deptToDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deptToDelete && (memberCounts[deptToDelete.id] ?? 0) > 0 ? (
                <>
                  <strong>{memberCounts[deptToDelete.id]}</strong> user
                  {memberCounts[deptToDelete.id] === 1 ? '' : 's'} assigned to this
                  department will be unassigned (their other settings are unaffected).
                  Confidential comments authored under this department will no longer be
                  visible to anyone but their author and admins. This cannot be undone.
                </>
              ) : (
                'This department has no members. This action cannot be undone.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDept.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteDept.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteDept.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
              ) : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
