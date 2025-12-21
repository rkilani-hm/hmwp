import { useState } from 'react';
import { useAdminWorkTypes, useCreateWorkType, useUpdateWorkType, useDeleteWorkType, WorkTypeData } from '@/hooks/useAdmin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, Pencil, Plus, Settings, Trash2 } from 'lucide-react';

const approverFields = [
  { key: 'requires_pm', label: 'Property Management' },
  { key: 'requires_pd', label: 'Project Development' },
  { key: 'requires_bdcr', label: 'BDCR' },
  { key: 'requires_mpr', label: 'MPR' },
  { key: 'requires_it', label: 'IT Department' },
  { key: 'requires_fitout', label: 'Fit-Out' },
  { key: 'requires_soft_facilities', label: 'Soft Facilities' },
  { key: 'requires_hard_facilities', label: 'Hard Facilities' },
];

const emptyWorkType = {
  name: '',
  requires_pm: false,
  requires_pd: false,
  requires_bdcr: false,
  requires_mpr: false,
  requires_it: false,
  requires_fitout: false,
  requires_soft_facilities: false,
  requires_hard_facilities: false,
};

export default function WorkTypesManagement() {
  const { data: workTypes, isLoading } = useAdminWorkTypes();
  const createWorkType = useCreateWorkType();
  const updateWorkType = useUpdateWorkType();
  const deleteWorkType = useDeleteWorkType();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingWorkType, setEditingWorkType] = useState<WorkTypeData | null>(null);
  const [formData, setFormData] = useState(emptyWorkType);

  const handleCreate = () => {
    if (!formData.name.trim()) return;
    createWorkType.mutate(formData, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setFormData(emptyWorkType);
      },
    });
  };

  const handleUpdate = () => {
    if (!editingWorkType || !formData.name.trim()) return;
    updateWorkType.mutate(
      { id: editingWorkType.id, ...formData },
      {
        onSuccess: () => {
          setEditingWorkType(null);
          setFormData(emptyWorkType);
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteWorkType.mutate(id);
  };

  const openEditDialog = (workType: WorkTypeData) => {
    setEditingWorkType(workType);
    setFormData({
      name: workType.name,
      requires_pm: workType.requires_pm,
      requires_pd: workType.requires_pd,
      requires_bdcr: workType.requires_bdcr,
      requires_mpr: workType.requires_mpr,
      requires_it: workType.requires_it,
      requires_fitout: workType.requires_fitout,
      requires_soft_facilities: workType.requires_soft_facilities,
      requires_hard_facilities: workType.requires_hard_facilities,
    });
  };

  const getRequiredApprovers = (workType: WorkTypeData) => {
    const required = approverFields
      .filter((field) => workType[field.key as keyof WorkTypeData])
      .map((field) => field.label);
    return required;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const WorkTypeForm = ({ isEdit }: { isEdit: boolean }) => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Work Type Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Electrical Work"
        />
      </div>
      <div className="space-y-4">
        <Label>Required Approvers (Scenario Configuration)</Label>
        <p className="text-sm text-muted-foreground">
          Select which departments need to approve permits of this type
        </p>
        <div className="grid gap-4">
          {approverFields.map((field) => (
            <div
              key={field.key}
              className="flex items-center justify-between p-3 rounded-lg border bg-card"
            >
              <Label htmlFor={field.key} className="cursor-pointer">
                {field.label}
              </Label>
              <Switch
                id={field.key}
                checked={formData[field.key as keyof typeof formData] as boolean}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, [field.key]: checked })
                }
              />
            </div>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => {
            setIsCreateOpen(false);
            setEditingWorkType(null);
            setFormData(emptyWorkType);
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={isEdit ? handleUpdate : handleCreate}
          disabled={
            !formData.name.trim() ||
            createWorkType.isPending ||
            updateWorkType.isPending
          }
        >
          {(createWorkType.isPending || updateWorkType.isPending) && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          {isEdit ? 'Save Changes' : 'Create Work Type'}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Work Types Management</h1>
          <p className="text-muted-foreground">
            Configure approval scenarios for different types of work permits
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Work Type
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Work Type</DialogTitle>
              <DialogDescription>
                Define a new work type and configure which approvers are required
              </DialogDescription>
            </DialogHeader>
            <WorkTypeForm isEdit={false} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Approval Scenarios
          </CardTitle>
          <CardDescription>
            Each work type defines which departments must approve permits of that type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work Type</TableHead>
                  <TableHead>Required Approvers</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workTypes?.map((workType) => (
                  <TableRow key={workType.id}>
                    <TableCell className="font-medium">{workType.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {getRequiredApprovers(workType).map((approver) => (
                          <Badge key={approver} variant="outline" className="text-xs">
                            <Check className="h-3 w-3 mr-1" />
                            {approver}
                          </Badge>
                        ))}
                        {getRequiredApprovers(workType).length === 0 && (
                          <span className="text-sm text-muted-foreground">
                            No approvers required
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Dialog
                          open={editingWorkType?.id === workType.id}
                          onOpenChange={(open) => {
                            if (!open) {
                              setEditingWorkType(null);
                              setFormData(emptyWorkType);
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(workType)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Edit Work Type</DialogTitle>
                              <DialogDescription>
                                Modify the work type and its approval requirements
                              </DialogDescription>
                            </DialogHeader>
                            <WorkTypeForm isEdit={true} />
                          </DialogContent>
                        </Dialog>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Work Type?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the "{workType.name}" work type.
                                Existing permits using this type will not be affected.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(workType.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {workTypes?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      No work types configured. Create one to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
