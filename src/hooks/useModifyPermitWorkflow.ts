// =============================================================================
// useModifyPermitWorkflow — PHASE 1b REWRITE
// Accepts a discriminated auth payload (password OR webauthn) instead of
// a raw password string. The edge function is updated to match.
// =============================================================================

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type WorkflowAuth =
  | { authMethod: 'password'; password: string }
  | {
      authMethod: 'webauthn';
      webauthn: { challengeId: string; assertion: unknown };
    };

export interface ModifyWorkflowParams {
  permitId: string;
  modificationType: 'work_type_change' | 'custom_flow';
  newWorkTypeId?: string;
  customSteps?: { stepId: string; isRequired: boolean }[];
  reason: string;
  auth: WorkflowAuth;
}

export function useModifyPermitWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ModifyWorkflowParams) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const body: Record<string, unknown> = {
        permitId: params.permitId,
        modificationType: params.modificationType,
        newWorkTypeId: params.newWorkTypeId,
        customSteps: params.customSteps,
        reason: params.reason,
        authMethod: params.auth.authMethod,
      };
      if (params.auth.authMethod === 'password') {
        body.password = params.auth.password;
      } else {
        body.webauthn = params.auth.webauthn;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/modify-permit-workflow`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to modify workflow');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['permit-workflow-overrides', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['permit-workflow-audit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      toast.success('Workflow modified successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to modify workflow');
    },
  });
}
