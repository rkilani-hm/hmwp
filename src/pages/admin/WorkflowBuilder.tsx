import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Settings2, Trash2, GripVertical, ArrowRight, Users, Building2, Loader2, ChevronUp, ChevronDown, CheckCircle, AlertTriangle, XCircle, User } from 'lucide-react';
import { 
  useWorkflowTemplates, 
  useWorkflowSteps,
  useCreateWorkflowTemplate,
  useUpdateWorkflowTemplate,
  useDeleteWorkflowTemplate,
  useAddWorkflowStep,
  useUpdateWorkflowStep,
  useDeleteWorkflowStep,
  useReorderWorkflowSteps,
  useValidateWorkflowTemplate,
  WorkflowTemplate,
  WorkflowStep
} from '@/hooks/useWorkflowTemplates';
import { useRoles } from '@/hooks/useRoles';
import { useUsersByRole } from '@/hooks/useUsersByRole';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function WorkflowBuilder() {
  const [activeTab, setActiveTab] = useState<'client' | 'internal'>('client');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddStepOpen, setIsAddStepOpen] = useState(false);

  const { data: templates, isLoading: templatesLoading } = useWorkflowTemplates();
  const { data: roles } = useRoles();
  const { data: usersByRole } = useUsersByRole();
  
  const filteredTemplates = templates?.filter(t => t.workflow_type === activeTab) || [];
  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workflow Builder</h1>
          <p className="text-muted-foreground">
            Configure approval workflows for different permit types
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as 'client' | 'internal'); setSelectedTemplateId(null); }}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="client" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Client Workflows
          </TabsTrigger>
          <TabsTrigger value="internal" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Internal Workflows
          </TabsTrigger>
        </TabsList>

        <TabsContent value="client" className="space-y-4">
          <WorkflowTemplateList
            templates={filteredTemplates}
            selectedId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
            onCreateNew={() => setIsCreateOpen(true)}
            isLoading={templatesLoading}
          />
        </TabsContent>

        <TabsContent value="internal" className="space-y-4">
          <WorkflowTemplateList
            templates={filteredTemplates}
            selectedId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
            onCreateNew={() => setIsCreateOpen(true)}
            isLoading={templatesLoading}
          />
        </TabsContent>
      </Tabs>

      {selectedTemplate && (
        <WorkflowEditor
          template={selectedTemplate}
          roles={roles || []}
          usersByRole={usersByRole || {}}
          onAddStep={() => setIsAddStepOpen(true)}
        />
      )}

      <CreateTemplateDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        workflowType={activeTab}
      />

      {selectedTemplateId && (
        <AddStepDialog
          open={isAddStepOpen}
          onOpenChange={setIsAddStepOpen}
          templateId={selectedTemplateId}
          roles={roles || []}
        />
      )}
    </div>
  );
}

// Template List Component
function WorkflowTemplateList({
  templates,
  selectedId,
  onSelect,
  onCreateNew,
  isLoading,
}: {
  templates: WorkflowTemplate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  isLoading: boolean;
}) {
  const deleteTemplate = useDeleteWorkflowTemplate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {templates.map((template) => (
        <Card
          key={template.id}
          className={`cursor-pointer transition-all hover:shadow-md ${
            selectedId === template.id ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => onSelect(template.id)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">{template.name}</CardTitle>
                {template.is_default && (
                  <Badge variant="secondary" className="mt-1">Default</Badge>
                )}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Workflow Template?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete "{template.name}" and all its steps.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteTemplate.mutate(template.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {template.description || 'No description'}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={template.is_active ? 'default' : 'secondary'}>
                {template.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card
        className="cursor-pointer border-dashed hover:border-primary hover:bg-muted/50 transition-all"
        onClick={onCreateNew}
      >
        <CardContent className="flex flex-col items-center justify-center h-full min-h-[140px] gap-2">
          <Plus className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            Create New Workflow
          </span>
        </CardContent>
      </Card>
    </div>
  );
}

// Workflow Editor Component
function WorkflowEditor({
  template,
  roles,
  usersByRole,
  onAddStep,
}: {
  template: WorkflowTemplate;
  roles: { id: string; name: string; label: string }[];
  usersByRole: Record<string, { user_id: string; full_name: string | null; email: string }[]>;
  onAddStep: () => void;
}) {
  const { data: steps, isLoading } = useWorkflowSteps(template.id);
  const updateTemplate = useUpdateWorkflowTemplate();
  const updateStep = useUpdateWorkflowStep();
  const deleteStep = useDeleteWorkflowStep();
  const reorderSteps = useReorderWorkflowSteps();
  const validateTemplate = useValidateWorkflowTemplate();

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description || '');
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);

  const handleSaveDetails = () => {
    updateTemplate.mutate({
      id: template.id,
      name,
      description,
    });
    setEditingName(false);
  };

  const handleValidate = async () => {
    const result = await validateTemplate.mutateAsync(template.id);
    setValidationResult(result);
  };

  const handleMoveStep = (stepId: string, direction: 'up' | 'down') => {
    if (!steps) return;
    
    const currentIndex = steps.findIndex(s => s.id === stepId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= steps.length) return;

    const newSteps = [...steps];
    [newSteps[currentIndex], newSteps[newIndex]] = [newSteps[newIndex], newSteps[currentIndex]];
    
    const reorderedSteps = newSteps.map((s, i) => ({
      id: s.id,
      step_order: i + 1,
    }));

    reorderSteps.mutate({ templateId: template.id, steps: reorderedSteps });
    setValidationResult(null); // Clear validation on changes
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {editingName ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Workflow Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter workflow name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe this workflow"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveDetails}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingName(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <CardTitle className="flex items-center gap-2">
                  {template.name}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setName(template.name);
                      setDescription(template.description || '');
                      setEditingName(true);
                    }}
                  >
                    <Settings2 className="h-3 w-3" />
                  </Button>
                </CardTitle>
                <CardDescription>{template.description || 'No description'}</CardDescription>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="is-default" className="text-sm">Default</Label>
              <Switch
                id="is-default"
                checked={template.is_default}
                onCheckedChange={(checked) =>
                  updateTemplate.mutate({ id: template.id, is_default: checked })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="is-active" className="text-sm">Active</Label>
              <Switch
                id="is-active"
                checked={template.is_active}
                onCheckedChange={(checked) =>
                  updateTemplate.mutate({ id: template.id, is_active: checked })
                }
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Validation Results */}
          {validationResult && (
            <div className="space-y-2">
              {validationResult.valid ? (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800 dark:text-green-200">Workflow Valid</AlertTitle>
                  <AlertDescription className="text-green-700 dark:text-green-300">
                    All roles exist and the workflow is properly configured.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Validation Failed</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside mt-1">
                      {validationResult.errors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              {validationResult.warnings.length > 0 && (
                <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertTitle className="text-yellow-800 dark:text-yellow-200">Warnings</AlertTitle>
                  <AlertDescription className="text-yellow-700 dark:text-yellow-300">
                    <ul className="list-disc list-inside mt-1">
                      {validationResult.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Approval Steps</h3>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleValidate}
                disabled={validateTemplate.isPending}
              >
                {validateTemplate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-1" />
                )}
                Validate
              </Button>
              <Button size="sm" onClick={onAddStep}>
                <Plus className="h-4 w-4 mr-1" />
                Add Step
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : steps && steps.length > 0 ? (
            <div className="space-y-2">
              {/* Visual workflow preview */}
              <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg overflow-x-auto">
                {steps.map((step, index) => (
                  <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center min-w-max">
                      <Badge variant={step.is_required_default ? 'default' : 'secondary'}>
                        {step.step_name || step.role?.label || 'Unknown'}
                      </Badge>
                      <span className="text-xs text-muted-foreground mt-1">
                        Step {step.step_order}
                      </span>
                    </div>
                    {index < steps.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Step list with controls */}
              <div className="border rounded-lg divide-y">
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-4 p-4 hover:bg-muted/50"
                  >
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === 0}
                        onClick={() => handleMoveStep(step.id, 'up')}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === steps.length - 1}
                        onClick={() => handleMoveStep(step.id, 'down')}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                      <span className="font-mono text-sm">{step.step_order}</span>
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">
                        {step.step_name || step.role?.label || 'Unknown Role'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Role: {step.role?.name || 'unknown'}
                      </div>
                      {/* Show assigned users */}
                      {step.role_id && usersByRole[step.role_id] && usersByRole[step.role_id].length > 0 ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1.5 mt-1 text-xs text-primary cursor-pointer hover:underline">
                                <User className="h-3 w-3" />
                                <span>
                                  {usersByRole[step.role_id].length === 1
                                    ? usersByRole[step.role_id][0].full_name || usersByRole[step.role_id][0].email
                                    : `${usersByRole[step.role_id].length} users assigned`}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <div className="space-y-1">
                                <p className="font-medium text-xs mb-1">Assigned Users:</p>
                                {usersByRole[step.role_id].map((user) => (
                                  <div key={user.user_id} className="text-xs">
                                    {user.full_name || user.email}
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <Link 
                          to="/approvers" 
                          className="flex items-center gap-1.5 mt-1 text-xs text-destructive hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <User className="h-3 w-3" />
                          <span className="italic">No users assigned – Click to add</span>
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`required-${step.id}`} className="text-sm">
                          Required by default
                        </Label>
                        <Switch
                          id={`required-${step.id}`}
                          checked={step.is_required_default}
                          onCheckedChange={(checked) =>
                            updateStep.mutate({
                              id: step.id,
                              templateId: template.id,
                              is_required_default: checked,
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`skip-${step.id}`} className="text-sm">
                          Can skip
                        </Label>
                        <Switch
                          id={`skip-${step.id}`}
                          checked={step.can_be_skipped}
                          onCheckedChange={(checked) =>
                            updateStep.mutate({
                              id: step.id,
                              templateId: template.id,
                              can_be_skipped: checked,
                            })
                          }
                        />
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Step?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove "{step.step_name || step.role?.label}" from the workflow.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                deleteStep.mutate({ id: step.id, templateId: template.id })
                              }
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No steps configured. Add approval steps to define the workflow.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Create Template Dialog
function CreateTemplateDialog({
  open,
  onOpenChange,
  workflowType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowType: 'internal' | 'client';
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const createTemplate = useCreateWorkflowTemplate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTemplate.mutate(
      {
        name,
        workflow_type: workflowType,
        description,
        is_default: isDefault,
      },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
          setIsDefault(false);
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create {workflowType === 'client' ? 'Client' : 'Internal'} Workflow</DialogTitle>
          <DialogDescription>
            Define a new approval workflow template for {workflowType} permits.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Workflow Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Standard Client Approval"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe when this workflow should be used"
              rows={3}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="is-default"
              checked={isDefault}
              onCheckedChange={setIsDefault}
            />
            <Label htmlFor="is-default">Set as default for {workflowType} permits</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || createTemplate.isPending}>
              {createTemplate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Create Workflow
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Add Step Dialog
function AddStepDialog({
  open,
  onOpenChange,
  templateId,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  roles: { id: string; name: string; label: string }[];
}) {
  const [roleId, setRoleId] = useState('');
  const [stepName, setStepName] = useState('');
  const [isRequired, setIsRequired] = useState(true);
  const [canBeSkipped, setCanBeSkipped] = useState(false);

  const { data: existingSteps } = useWorkflowSteps(templateId);
  const addStep = useAddWorkflowStep();

  // Filter out roles already in the workflow
  const existingRoleIds = new Set(existingSteps?.map(s => s.role_id) || []);
  const availableRoles = roles.filter(r => !existingRoleIds.has(r.id) && (r as any).is_active !== false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextOrder = (existingSteps?.length || 0) + 1;

    addStep.mutate(
      {
        workflow_template_id: templateId,
        role_id: roleId,
        step_order: nextOrder,
        is_required_default: isRequired,
        can_be_skipped: canBeSkipped,
        step_name: stepName || undefined,
      },
      {
        onSuccess: () => {
          setRoleId('');
          setStepName('');
          setIsRequired(true);
          setCanBeSkipped(false);
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Approval Step</DialogTitle>
          <DialogDescription>
            Add a new role to the approval workflow.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role">Select Role *</Label>
            <Select value={roleId} onValueChange={setRoleId} required>
              <SelectTrigger>
                <SelectValue placeholder="Choose a role..." />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.length > 0 ? (
                  availableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.label} ({role.name})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="" disabled>
                    All roles are already in this workflow
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stepName">Custom Step Name (optional)</Label>
            <Input
              id="stepName"
              value={stepName}
              onChange={(e) => setStepName(e.target.value)}
              placeholder="Leave empty to use role name"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="is-required"
              checked={isRequired}
              onCheckedChange={setIsRequired}
            />
            <Label htmlFor="is-required">Required by default</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="can-skip"
              checked={canBeSkipped}
              onCheckedChange={setCanBeSkipped}
            />
            <Label htmlFor="can-skip">Work types can skip this step</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!roleId || addStep.isPending}>
              {addStep.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Add Step
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
