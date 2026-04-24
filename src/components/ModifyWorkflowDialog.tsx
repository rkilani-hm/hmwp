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
import { Loader2, AlertTriangle, Settings2, Fingerprint, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAdminWorkTypes } from '@/hooks/useAdminWorkTypes';
import { useWorkflowSteps, useWorkTypeStepConfig } from '@/hooks/useWorkflowTemplates';
import { usePermitWorkflowOverridesMap } from '@/hooks/usePermitWorkflowOverrides';
import { useModifyPermitWorkflow, WorkflowAuth } from '@/hooks/useModifyPermitWorkflow';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
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

  // New auth state
  const [authTab, setAuthTab] = useState<'password' | 'webauthn'>('password');
  const [password, setPassword] = useState('');
  const [webauthnPayload, setWebauthnPayload] = useState<
    { challengeId: string; assertion: unknown } | null
  >(null);
  const [verifyingWebAuthn, setVerifyingWebAuthn] = useState(false);

  // Data
  const { data: workTypes, isLoading: workTypesLoading } = useAdminWorkTypes();
  const { data: currentSteps, isLoading: stepsLoading } = useWorkflowSteps(workflowTemplateId ?? undefined);
  const { data: currentStepConfig } = useWorkTypeStepConfig(currentWorkTypeId ?? undefined);
  const { data: permitOverrides } = usePermitWorkflowOverridesMap(permitId);

  const modifyWorkflow = useModifyPermitWorkflow();
  const {
    isSupported: webauthnSupported,
    platformAvailable,
    isChecking: webauthnChecking,
  } = useBiometricAuth();
  const isMobile = useIsMobile();
  const hasModifyPermission = useHasPermission('modify_workflow');

  const selectedWorkType = workTypes?.find((wt) => wt.id === selectedWorkTypeId);
  const { data: newWorkTypeSteps } = useWorkflowSteps(selectedWorkType?.workflow_template_id ?? undefined);
  const { data: newWorkTypeStepConfig } = useWorkTypeStepConfig(selectedWorkTypeId ?? undefined);

  const showBiometricOption = isMobile && webauthnSupported && platformAvailable && !webauthnChecking;

  const currentRequiredMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (currentSteps) {
      for (const step of currentSteps) {
        if (permitOverrides?.has(step.id)) {
          map.set(step.id, permitOverrides.get(step.id)!);
        } else if (currentStepConfig) {
          const config = currentStepConfig.find((c) => c.workflow_step_id === step.id);
          map.set(step.id, config ? config.is_required : step.is_required_default);
        } else {
          map.set(step.id, step.is_required_default);
        }
      }
    }
    return map;
  }, [currentSteps, currentStepConfig, permitOverrides]);

  const newRequiredMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (activeTab === 'work_type' && newWorkTypeSteps) {
      for (const step of newWorkTypeSteps) {
        const config = newWorkTypeStepConfig?.find((c) => c.workflow_step_id === step.id);
        map.set(step.id, config ? config.is_required : step.is_required_default);
      }
    } else if (activeTab === 'custom' && currentSteps) {
      for (const step of currentSteps) {
        if (customSteps.has(step.id)) {
          map.set(step.id, customSteps.get(step.id)!);
        } else {
          map.set(step.id, currentRequiredMap.get(step.id) ?? step.is_required_default);
        }
      }
    }
    return map;
  }, [activeTab, newWorkTypeSteps, newWorkTypeStepConfig, currentSteps, customSteps, currentRequiredMap]);

  const stepsToShow = activeTab === 'work_type' ? newWorkTypeSteps || [] : currentSteps || [];

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setActiveTab('work_type');
      setSelectedWorkTypeId(null);
      setCustomSteps(new Map());
      setReason('');
      setPassword('');
      setWebauthnPayload(null);
      setAuthTab(showBiometricOption ? 'webauthn' : 'password');
    }
  }, [open, showBiometricOption]);

  useEffect(() => {
    if (activeTab === 'custom' && customSteps.size === 0 && currentSteps) {
      const initial = new Map<string, boolean>();
      for (const step of currentSteps) {
        initial.set(step.id, currentRequiredMap.get(step.id) ?? step.is_required_default);
      }
      setCustomSteps(initial);
    }
  }, [activeTab, currentSteps, currentRequiredMap, customSteps.size]);

  const handleWebAuthnVerify = async () => {
    setVerifyingWebAuthn(true);
    try {
      // Call challenge endpoint directly with purpose='workflow_modify'
      const { data, error } = await supabase.functions.invoke('webauthn-auth-challenge', {
        body: {
          purpose: 'workflow_modify',
          binding: { permitId },
        },
      });
      if (error) throw new Error(error.message || 'Failed to issue challenge');

      const { options, challengeId } = data as {
        options: unknown;
        challengeId: string;
      };

      // Dynamically import @simplewebauthn/browser to trigger the prompt
      const { startAuthentication } = await import('@simplewebauthn/browser');
      // deno-lint-ignore no-explicit-any
      const assertion = await startAuthentication({ optionsJSON: options as any });

      setWebauthnPayload({ challengeId, assertion });
      toast.success('Identity verified');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Biometric verification failed';
      if (msg.includes('NotAllowed') || msg.includes('cancelled') || msg.includes('AbortError')) {
        toast.error('Verification cancelled');
      } else if (msg.includes('No biometric credentials')) {
        toast.error('No biometric device registered. Register one in Settings → Security.');
      } else {
        toast.error(msg);
      }
      setWebauthnPayload(null);
    } finally {
      setVerifyingWebAuthn(false);
    }
  };

  const buildAuth = (): WorkflowAuth | null => {
    if (authTab === 'password') {
      if (!password) return null;
      return { authMethod: 'password', password };
    }
    if (!webauthnPayload) return null;
    return { authMethod: 'webauthn', webauthn: webauthnPayload };
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for the modification');
      return;
    }
    const auth = buildAuth();
    if (!auth) {
      toast.error('Please verify your identity with password or biometrics');
      return;
    }

    try {
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
          auth,
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
          auth,
        });
      }
      onOpenChange(false);
    } catch {
      // Invalidate the one-shot webauthn payload on error
      setWebauthnPayload(null);
    }
  };

  const hasChanges = useMemo(() => {
    if (activeTab === 'work_type') {
      return selectedWorkTypeId && selectedWorkTypeId !== currentWorkTypeId;
    }
    for (const step of currentSteps || []) {
      const current = currentRequiredMap.get(step.id) ?? step.is_required_default;
      const custom = customSteps.get(step.id);
      if (custom !== undefined && custom !== current) return true;
    }
    return false;
  }, [activeTab, selectedWorkTypeId, currentWorkTypeId, currentSteps, currentRequiredMap, customSteps]);

  const canSubmit =
    hasChanges &&
    !!reason.trim() &&
    ((authTab === 'password' && !!password) || (authTab === 'webauthn' && !!webauthnPayload)) &&
    !modifyWorkflow.isPending;

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
              You don't have permission to modify workflows. Contact an administrator to grant the
              "Modify Workflow" permission to your role.
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

            <ScrollArea className="h-[360px] mt-4">
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
                        ?.filter((wt) => wt.id !== currentWorkTypeId && wt.workflow_template_id)
                        .map((wt) => (
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
                    {currentSteps?.map((step) => {
                      const isRequired =
                        customSteps.get(step.id) ??
                        (currentRequiredMap.get(step.id) ?? step.is_required_default);
                      const originalRequired =
                        currentRequiredMap.get(step.id) ?? step.is_required_default;
                      const changed =
                        customSteps.has(step.id) && customSteps.get(step.id) !== originalRequired;

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
              {showBiometricOption ? (
                <Tabs value={authTab} onValueChange={(v) => setAuthTab(v as 'password' | 'webauthn')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="password">Password</TabsTrigger>
                    <TabsTrigger value="webauthn">
                      <Fingerprint className="h-4 w-4 mr-1" />
                      Fingerprint
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="password" className="mt-2">
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </TabsContent>
                  <TabsContent value="webauthn" className="mt-2 space-y-2">
                    {webauthnPayload ? (
                      <Alert className="bg-success/10 border-success/30">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <AlertDescription className="text-success">
                          Identity verified — this assertion is bound to this workflow change only.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleWebAuthnVerify}
                        disabled={verifyingWebAuthn}
                        className="w-full"
                      >
                        {verifyingWebAuthn ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          <>
                            <Fingerprint className="h-4 w-4 mr-2" />
                            Verify with Fingerprint
                          </>
                        )}
                      </Button>
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              )}
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
          <Button onClick={handleSubmit} disabled={!canSubmit}>
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
