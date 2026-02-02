import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertTriangle, Settings2, Fingerprint, ArrowRight } from 'lucide-react';
import { useAdminWorkTypes, WorkType } from '@/hooks/useAdminWorkTypes';
import { useWorkflowSteps, useWorkTypeStepConfig, WorkflowStep } from '@/hooks/useWorkflowTemplates';
import { usePermitWorkflowOverridesMap } from '@/hooks/usePermitWorkflowOverrides';
import { useModifyPermitWorkflow } from '@/hooks/useModifyPermitWorkflow';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { WorkflowModificationPreview } from './WorkflowModificationPreview';
import { useHasPermission } from '@/hooks/useHasPermission';
import { toast } from 'sonner';

interface ModifyWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permitId: string;
  currentWorkTypeId: string | null;
  currentWorkTypeName: string | null;
  workflowTemplateId: string | null;
}

const BIOMETRIC_TOKEN = '__BIOMETRIC_VERIFIED__';

export function ModifyWorkflowDialog({
  open,
  onOpenChange,
  permitId,
  currentWorkTypeId,
  currentWorkTypeName,
  workflowTemplateId,
}: ModifyWorkflowDialogProps) {
  const [activeTab, setActiveTab] = useState<'work_type' | 'custom'>('work_type');
  const [selectedWorkTypeId, setSelectedWorkTypeId] = useState<string | null>(null);
  const [customSteps, setCustomSteps] = useState<Map<string, boolean>>(new Map());
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Fetch data
  const { data: workTypes, isLoading: workTypesLoading } = useAdminWorkTypes();
  const { data: currentSteps, isLoading: stepsLoading } = useWorkflowSteps(workflowTemplateId ?? undefined);
  const { data: currentStepConfig } = useWorkTypeStepConfig(currentWorkTypeId ?? undefined);
  const { data: permitOverrides } = usePermitWorkflowOverridesMap(permitId);
  
  const modifyWorkflow = useModifyPermitWorkflow();
  const { isSupported: biometricSupported, verifyIdentity, isChecking: biometricChecking } = useBiometricAuth();
  const hasModifyPermission = useHasPermission('modify_workflow');

  // Get selected work type's template and steps
  const selectedWorkType = workTypes?.find(wt => wt.id === selectedWorkTypeId);
  const { data: newWorkTypeSteps } = useWorkflowSteps(selectedWorkType?.workflow_template_id ?? undefined);
  const { data: newWorkTypeStepConfig } = useWorkTypeStepConfig(selectedWorkTypeId ?? undefined);

  // Build current required map (considering overrides)
  const currentRequiredMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (currentSteps) {
      for (const step of currentSteps) {
        // Check permit overrides first, then step config, then default
        if (permitOverrides?.has(step.id)) {
          map.set(step.id, permitOverrides.get(step.id)!);
        } else if (currentStepConfig) {
          const config = currentStepConfig.find(c => c.workflow_step_id === step.id);
          map.set(step.id, config ? config.is_required : step.is_required_default);
        } else {
          map.set(step.id, step.is_required_default);
        }
      }
    }
    return map;
  }, [currentSteps, currentStepConfig, permitOverrides]);

  // Build new required map based on selection
  const newRequiredMap = useMemo(() => {
    const map = new Map<string, boolean>();
    
    if (activeTab === 'work_type' && newWorkTypeSteps) {
      for (const step of newWorkTypeSteps) {
        const config = newWorkTypeStepConfig?.find(c => c.workflow_step_id === step.id);
        map.set(step.id, config ? config.is_required : step.is_required_default);
      }
    } else if (activeTab === 'custom' && currentSteps) {
      for (const step of currentSteps) {
        // Use custom selection if set, otherwise current
        if (customSteps.has(step.id)) {
          map.set(step.id, customSteps.get(step.id)!);
        } else {
          map.set(step.id, currentRequiredMap.get(step.id) ?? step.is_required_default);
        }
      }
    }
    
    return map;
  }, [activeTab, newWorkTypeSteps, newWorkTypeStepConfig, currentSteps, customSteps, currentRequiredMap]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedWorkTypeId(null);
      setCustomSteps(new Map());
      setReason('');
      setPassword('');
      setActiveTab('work_type');
    }
  }, [open]);

  // Initialize custom steps from current required map
  useEffect(() => {
    if (activeTab === 'custom' && customSteps.size === 0 && currentSteps) {
      const initial = new Map<string, boolean>();
      for (const step of currentSteps) {
        initial.set(step.id, currentRequiredMap.get(step.id) ?? step.is_required_default);
      }
      setCustomSteps(initial);
    }
  }, [activeTab, currentSteps, currentRequiredMap, customSteps.size]);

  const handleBiometricAuth = async () => {
    const result = await verifyIdentity();
    if (result.success) {
      setPassword(BIOMETRIC_TOKEN);
      toast.success('Biometric verification successful');
    } else {
      toast.error(result.error || 'Biometric verification failed');
    }
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for the modification');
      return;
    }

    if (!password) {
      toast.error('Please verify your identity with password or biometrics');
      return;
    }

    if (activeTab === 'work_type') {
      if (!selectedWorkTypeId) {
        toast.error('Please select a work type');
        return;
      }

      await modifyWorkflow.mutateAsync({
        permitId,
        modificationType: 'work_type_change',
        newWorkTypeId: selectedWorkTypeId,
        reason: reason.trim(),
        password,
      });
    } else {
      const steps = Array.from(customSteps.entries()).map(([stepId, isRequired]) => ({
        stepId,
        isRequired,
      }));

      await modifyWorkflow.mutateAsync({
        permitId,
        modificationType: 'custom_flow',
        customSteps: steps,
        reason: reason.trim(),
        password,
      });
    }

    onOpenChange(false);
  };

  const hasChanges = useMemo(() => {
    if (activeTab === 'work_type') {
      return selectedWorkTypeId && selectedWorkTypeId !== currentWorkTypeId;
    } else {
      // Check if any custom step differs from current
      for (const step of currentSteps || []) {
        const current = currentRequiredMap.get(step.id) ?? step.is_required_default;
        const custom = customSteps.get(step.id);
        if (custom !== undefined && custom !== current) {
          return true;
        }
      }
      return false;
    }
  }, [activeTab, selectedWorkTypeId, currentWorkTypeId, currentSteps, currentRequiredMap, customSteps]);

  const stepsToShow = activeTab === 'work_type' ? (newWorkTypeSteps || []) : (currentSteps || []);

  if (!hasModifyPermission) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Permission Required
            </DialogTitle>
            <DialogDescription>
              You don't have permission to modify workflows. Contact an administrator to grant the "Modify Workflow" permission to your role.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Modify Workflow
          </DialogTitle>
          <DialogDescription>
            Adjust the workflow for this permit. Changes will be logged with your identity.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'work_type' | 'custom')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="work_type">Change Work Type</TabsTrigger>
              <TabsTrigger value="custom">Custom Flow</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[400px] mt-4">
              <TabsContent value="work_type" className="space-y-4 px-1">
                <div className="space-y-2">
                  <Label>Current Work Type</Label>
                  <div className="p-3 rounded-md bg-muted">
                    <span className="font-medium">{currentWorkTypeName || 'Not set'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Select New Work Type</Label>
                  <Select
                    value={selectedWorkTypeId || ''}
                    onValueChange={setSelectedWorkTypeId}
                    disabled={workTypesLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a work type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {workTypes
                        ?.filter(wt => wt.id !== currentWorkTypeId && wt.workflow_template_id)
                        .map(wt => (
                          <SelectItem key={wt.id} value={wt.id}>
                            {wt.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedWorkTypeId && stepsToShow.length > 0 && (
                  <div className="space-y-2">
                    <Label>Workflow Preview</Label>
                    <WorkflowModificationPreview
                      currentSteps={currentSteps || []}
                      newSteps={stepsToShow}
                      currentRequiredMap={currentRequiredMap}
                      newRequiredMap={newRequiredMap}
                    />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="custom" className="space-y-4 px-1">
                <p className="text-sm text-muted-foreground">
                  Toggle which approval steps are required for this specific permit.
                </p>

                {stepsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currentSteps?.map(step => {
                      const isRequired = customSteps.get(step.id) ?? 
                        (currentRequiredMap.get(step.id) ?? step.is_required_default);
                      const originalRequired = currentRequiredMap.get(step.id) ?? step.is_required_default;
                      const changed = customSteps.has(step.id) && customSteps.get(step.id) !== originalRequired;

                      return (
                        <div
                          key={step.id}
                          className={`flex items-center justify-between p-3 rounded-md border ${
                            changed ? 'border-warning bg-warning/5' : 'border-border'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {step.role?.label || step.step_name || 'Unknown'}
                            </span>
                            {changed && (
                              <Badge variant="outline" className="text-warning border-warning">
                                Modified
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              {isRequired ? 'Required' : 'Skipped'}
                            </span>
                            <Switch
                              checked={isRequired}
                              onCheckedChange={(checked) => {
                                const newMap = new Map(customSteps);
                                newMap.set(step.id, checked);
                                setCustomSteps(newMap);
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <div className="space-y-4 mt-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Change *</Label>
              <Textarea
                id="reason"
                placeholder="Explain why this workflow modification is needed..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Verify Your Identity *</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password === BIOMETRIC_TOKEN ? '••••••••' : password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={password === BIOMETRIC_TOKEN}
                  />
                </div>
                {biometricSupported && !biometricChecking && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBiometricAuth}
                    disabled={password === BIOMETRIC_TOKEN}
                  >
                    <Fingerprint className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <Alert variant="default" className="bg-warning/10 border-warning/30">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                This modification will be permanently logged with your name, email, and timestamp.
              </AlertDescription>
            </Alert>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!hasChanges || !reason.trim() || !password || modifyWorkflow.isPending}
          >
            {modifyWorkflow.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-2" />
            )}
            Save & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
