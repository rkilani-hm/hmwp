import { useState, useEffect } from 'react';
import { useAdminWorkTypes, useCreateWorkType, useUpdateWorkType, useDeleteWorkType, WorkTypeData } from '@/hooks/useAdmin';
import { 
  useWorkflowTemplates, 
  useWorkflowSteps, 
  useWorkTypeStepConfig,
  useUpdateWorkTypeStepConfig,
  WorkflowStep 
} from '@/hooks/useWorkflowTemplates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { GitBranch, Loader2, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';

interface FormData {
  name: string;
  workflow_template_id: string | null;
}

const emptyFormData: FormData = {
  name: '',
  workflow_template_id: null,
};

export default function WorkTypesManagement() {
  const { data: workTypes, isLoading } = useAdminWorkTypes();
  const { data: workflowTemplates } = useWorkflowTemplates();
  const createWorkType = useCreateWorkType();
  const updateWorkType = useUpdateWorkType();
  const deleteWorkType = useDeleteWorkType();
  const updateStepConfig = useUpdateWorkTypeStepConfig();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingWorkType, setEditingWorkType] = useState<WorkTypeData | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyFormData);
  
  // Step configuration dialog state
  const [configuringWorkType, setConfiguringWorkType] = useState<WorkTypeData | null>(null);

  // Fetch workflow steps and configs for the work type being configured
  const { data: workflowSteps } = useWorkflowSteps(configuringWorkType?.workflow_template_id ?? undefined);
  const { data: existingStepConfigs } = useWorkTypeStepConfig(configuringWorkType?.id);

  // Track step configuration changes locally
  const [stepConfigs, setStepConfigs] = useState<Record<string, boolean>>({});

  // Initialize step configs when dialog opens or data loads
  useEffect(() => {
    if (workflowSteps && configuringWorkType) {
      const configs: Record<string, boolean> = {};
      workflowSteps.forEach((step) => {
        const existingConfig = existingStepConfigs?.find(c => c.workflow_step_id === step.id);
        // Use existing config if present, otherwise use the step's default
        configs[step.id] = existingConfig 
          ? existingConfig.is_required 
          : step.is_required_default;
      });
      setStepConfigs(configs);
    }
  }, [workflowSteps, existingStepConfigs, configuringWorkType]);

  const handleCreate = () => {
    if (!formData.name.trim()) return;
    createWorkType.mutate(
      {
        name: formData.name,
        workflow_template_id: formData.workflow_template_id,
        requires_pm: false,
        requires_pd: false,
        requires_bdcr: false,
        requires_mpr: false,
        requires_it: false,
        requires_fitout: false,
        requires_ecovert_supervisor: false,
        requires_pmd_coordinator: false,
      },
      {
        onSuccess: () => {
          setIsCreateOpen(false);
          setFormData(emptyFormData);
        },
      }
    );
  };

  const handleUpdate = () => {
    if (!editingWorkType || !formData.name.trim()) return;
    updateWorkType.mutate(
      { 
        id: editingWorkType.id, 
        name: formData.name,
        workflow_template_id: formData.workflow_template_id,
      },
      {
        onSuccess: () => {
          setEditingWorkType(null);
          setFormData(emptyFormData);
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
      workflow_template_id: workType.workflow_template_id,
    });
  };

  const handleStepToggle = async (stepId: string, isRequired: boolean) => {
    if (!configuringWorkType) return;
    
    // Update local state immediately for responsive UI
    setStepConfigs(prev => ({ ...prev, [stepId]: isRequired }));
    
    // Save to database
    await updateStepConfig.mutateAsync({
      workTypeId: configuringWorkType.id,
      workflowStepId: stepId,
      isRequired,
    });
  };

  const getWorkflowTemplateName = (templateId: string | null) => {
    if (!templateId || !workflowTemplates) return null;
    return workflowTemplates.find(t => t.id === templateId);
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

      <div className="space-y-2">
        <Label htmlFor="workflow">Workflow Template</Label>
        <Select
          value={formData.workflow_template_id || "none"}
          onValueChange={(value) =>
            setFormData({
              ...formData,
              workflow_template_id: value === "none" ? null : value,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a workflow template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No template assigned</SelectItem>
            {workflowTemplates?.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {template.workflow_type}
                  </Badge>
                  {template.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          After assigning a template, you can configure which approval steps are required for this work type.
        </p>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => {
            setIsCreateOpen(false);
            setEditingWorkType(null);
            setFormData(emptyFormData);
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
            Configure work types, assign workflow templates, and customize approval steps
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
                Define a new work type and assign a workflow template
              </DialogDescription>
            </DialogHeader>
            <WorkTypeForm isEdit={false} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Work Types & Workflow Configuration
          </CardTitle>
          <CardDescription>
            Each work type can be assigned a workflow template. You can then customize which steps are required for each work type.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work Type</TableHead>
                  <TableHead>Workflow Template</TableHead>
                  <TableHead>Step Configuration</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workTypes?.map((workType) => {
                  const template = getWorkflowTemplateName(workType.workflow_template_id);
                  return (
                    <TableRow key={workType.id}>
                      <TableCell className="font-medium">{workType.name}</TableCell>
                      <TableCell>
                        {template ? (
                          <div className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-muted-foreground" />
                            <span>{template.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {template.workflow_type}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            No template assigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {workType.workflow_template_id ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfiguringWorkType(workType)}
                          >
                            <Settings2 className="h-4 w-4 mr-1" />
                            Configure Steps
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            Assign template first
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Dialog
                            open={editingWorkType?.id === workType.id}
                            onOpenChange={(open) => {
                              if (!open) {
                                setEditingWorkType(null);
                                setFormData(emptyFormData);
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(workType)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle>Edit Work Type</DialogTitle>
                                <DialogDescription>
                                  Modify the work type name and workflow assignment
                                </DialogDescription>
                              </DialogHeader>
                              <WorkTypeForm isEdit={true} />
                            </DialogContent>
                          </Dialog>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
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
                  );
                })}
                {workTypes?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No work types configured. Create one to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Configure Steps Dialog */}
      <Dialog
        open={!!configuringWorkType}
        onOpenChange={(open) => {
          if (!open) {
            setConfiguringWorkType(null);
            setStepConfigs({});
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Approval Steps</DialogTitle>
            <DialogDescription>
              Choose which approval steps are required for "{configuringWorkType?.name}"
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-3 py-2">
              {workflowSteps?.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  No steps configured in this workflow template. Add steps in the Workflow Builder.
                </p>
              )}
              
              {workflowSteps?.map((step, index) => (
                <div 
                  key={step.id} 
                  className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant="outline" 
                      className="w-7 h-7 flex items-center justify-center rounded-full shrink-0"
                    >
                      {index + 1}
                    </Badge>
                    <div>
                      <p className="font-medium">
                        {step.step_name || step.role?.label || step.role?.name || 'Unknown Role'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {step.can_be_skipped ? 'Can be customized' : 'Always required (cannot be skipped)'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {stepConfigs[step.id] ? 'Required' : 'Skipped'}
                    </span>
                    <Switch
                      checked={stepConfigs[step.id] ?? step.is_required_default}
                      onCheckedChange={(checked) => handleStepToggle(step.id, checked)}
                      disabled={!step.can_be_skipped || updateStepConfig.isPending}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <Separator />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfiguringWorkType(null);
                setStepConfigs({});
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
