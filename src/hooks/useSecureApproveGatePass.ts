// =============================================================================
// useSecureApproveGatePass
//
// Server-verified gate pass approval mutation.
// Replaces the client-side password re-auth flow in GatePassDetail.tsx.
// =============================================================================

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { parseEdgeFunctionError } from '@/utils/edgeFunctionErrors';

export type ApprovalAuth =
  | { authMethod: 'password'; password: string }
  | {
      authMethod: 'webauthn';
      webauthn: { challengeId: string; assertion: unknown };
    };

interface ApproveGatePassArgs {
  gatePassId: string;
  role: string;
  comments: string;
  signature: string | null;
  approved: boolean;
  cctvConfirmed?: boolean;
  auth: ApprovalAuth;
}

export function useSecureApproveGatePass() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: ApproveGatePassArgs) => {
      const body: Record<string, unknown> = {
        gatePassId: args.gatePassId,
        role: args.role,
        comments: args.comments,
        signature: args.signature,
        approved: args.approved,
        cctvConfirmed: args.cctvConfirmed,
        authMethod: args.auth.authMethod,
      };
      if (args.auth.authMethod === 'password') {
        body.password = args.auth.password;
      } else {
        body.webauthn = args.auth.webauthn;
      }

      const { data, error } = await supabase.functions.invoke(
        'verify-gate-pass-approval',
        { body },
      );
      if (error) {
        const msg = parseEdgeFunctionError(error, data);
        throw new Error(msg);
      }
      if (data?.error) {
        const msg = parseEdgeFunctionError({ message: data.error }, data);
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      queryClient.invalidateQueries({ queryKey: ['gate-pass', vars.gatePassId] });
      toast.success(
        vars.approved
          ? 'Gate pass approved with verified signature!'
          : 'Gate pass rejected',
      );
    },
    onError: (error: Error) => {
      const message = error.message || 'Failed to process gate pass approval';
      if (
        !message.toLowerCase().includes('password') &&
        !message.toLowerCase().includes('incorrect')
      ) {
        toast.error(message);
      }
    },
  });
}
