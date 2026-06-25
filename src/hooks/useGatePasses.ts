import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useEffect } from 'react';
import type { GatePass, GatePassItem } from '@/types/gatePass';

// Fan-out approver notifications for a gate pass via the server-side RPC — the GP
// analogue of notifyActiveApprovers (useWorkPermits). notify_gate_pass_active_approvers
// runs SECURITY DEFINER (bypasses the RLS that blocks a requester from reading
// other users' roles/emails), inserts idempotent in-app notifications, and
// returns user_ids + emails to hand to the push/email edge functions.
async function notifyGatePassApprovers(gatePassId: string, passNo: string) {
  try {
    const { data, error } = await supabase.rpc('notify_gate_pass_active_approvers' as any, {
      p_gate_pass_id: gatePassId,
      p_notification_type: 'gatepass_pending',
    });
    if (error) {
      console.error(`[gp-notify] notify_gate_pass_active_approvers failed for ${passNo}:`, error);
      return;
    }
    const payload = (data || {}) as { user_ids?: string[]; emails?: string[] };
    const userIds = payload.user_ids ?? [];
    const emails = payload.emails ?? [];

    if (userIds.length > 0) {
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: {
            userIds,
            title: 'New Gate Pass',
            message: `${passNo} requires your review`,
            data: { url: '/gate-passes/approvals', gatePassId },
          },
        });
      } catch (e) { console.error('[gp-notify] push failed:', e); }
    }
    if (emails.length > 0) {
      try {
        await supabase.functions.invoke('send-email-notification', {
          body: {
            to: emails,
            notificationType: 'approval_required',
            subject: `Gate Pass Awaiting Approval: ${passNo}`,
            permitNo: passNo,
            details: {},
          },
        });
      } catch (e) { console.error('[gp-notify] email failed:', e); }
    }
  } catch (e) {
    console.error('[gp-notify] error:', e);
  }
}

export function useGatePasses() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('gate-passes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_passes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ['gate-passes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gate_passes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as GatePass[];
    },
    enabled: !!user,
  });
}

/**
 * Gate passes pending the current user's action — the GP analogue of
 * usePendingPermitsForApprover. Resolution is server-side via
 * get_my_gate_pass_inbox() (reads gate_pass_active_approvers, role-based on the
 * caller's effective roles, so delegation applies), replacing the old
 * client-side `status === 'pending_<role>'` match. Then a hydrate query fetches
 * the full rows (approvers can read all gate passes via RLS).
 */
export function usePendingGatePassesForApprover() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pending-gate-passes-approver', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<GatePass[]> => {
      const { data: rows, error } = await supabase.rpc('get_my_gate_pass_inbox' as any);
      if (error) throw error;
      const list = (rows as unknown as Array<{ gate_pass_id: string; pass_created_at: string | null }> | null) ?? [];
      if (list.length === 0) return [];

      const sorted = [...list].sort((a, b) => {
        if (a.pass_created_at === b.pass_created_at) return 0;
        if (!a.pass_created_at) return 1;
        if (!b.pass_created_at) return -1;
        return a.pass_created_at < b.pass_created_at ? 1 : -1; // newest first
      });
      const ids: string[] = [];
      const seen = new Set<string>();
      for (const r of sorted) {
        if (!seen.has(r.gate_pass_id)) { seen.add(r.gate_pass_id); ids.push(r.gate_pass_id); }
      }

      const { data: passes, error: hErr } = await supabase
        .from('gate_passes')
        .select('*')
        .in('id', ids);
      if (hErr) throw hErr;

      const byId = new Map((passes ?? []).map((p) => [p.id as string, p as GatePass]));
      return ids.map((id) => byId.get(id)).filter(Boolean) as GatePass[];
    },
  });
}

export function useGatePass(id: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['gate-pass', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('gate_passes')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;

      // Fetch items
      const { data: items, error: itemsError } = await supabase
        .from('gate_pass_items')
        .select('*')
        .eq('gate_pass_id', id)
        .order('serial_number');
      if (itemsError) throw itemsError;

      return { ...data, items: items || [] } as GatePass;
    },
    enabled: !!user && !!id,
  });
}

export function useCreateGatePass() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      pass_category: string;
      pass_type: string;
      client_contractor_name?: string;
      client_rep_name?: string;
      client_rep_email?: string;
      client_rep_contact?: string;
      unit_floor?: string;
      delivery_area?: string;
      valid_from?: string;
      valid_to?: string;
      time_from?: string;
      time_to?: string;
      vehicle_make_model?: string;
      vehicle_license_plate?: string;
      shifting_method?: string;
      purpose?: string;
      delivery_type?: string;
      items: GatePassItem[];
    }) => {
      // Generate gate pass number via Postgres RPC.
      // Uses Asia/Kuwait local time to determine "today".
      // Format: GP-YYMMDD-NN (e.g. GP-260425-01).
      const { data: rpcPassNo, error: rpcErr } = await supabase
        .rpc('next_gate_pass_number_today');
      if (rpcErr || !rpcPassNo) {
        throw new Error(rpcErr?.message || 'Failed to allocate gate pass number');
      }
      const passNo = rpcPassNo as string;
      const hasHighValue = input.items.some(i => i.is_high_value);
      const { items, ...passData } = input;

      // Determine initial status from workflow mapping
      let initialStatus = 'pending_store_manager';
      try {
        const { data: mapping } = await supabase
          .from('gate_pass_type_workflows')
          .select('workflow_template_id')
          .eq('pass_type', input.pass_type)
          .maybeSingle();

        if (mapping?.workflow_template_id) {
          const { data: firstStep } = await supabase
            .from('workflow_steps')
            .select('role:roles(name)')
            .eq('workflow_template_id', mapping.workflow_template_id)
            .order('step_order', { ascending: true })
            .limit(1)
            .single();

          if (firstStep?.role && typeof firstStep.role === 'object' && 'name' in firstStep.role) {
            initialStatus = `pending_${(firstStep.role as any).name}`;
          }
        }
      } catch {
        // Fallback to default
      }

      const { data, error } = await supabase
        .from('gate_passes')
        .insert({
          ...passData,
          pass_no: passNo,
          requester_id: user?.id,
          requester_name: profile?.full_name || user?.email || 'Unknown',
          requester_email: user?.email || '',
          status: initialStatus,
          has_high_value_asset: hasHighValue,
        } as any)
        .select()
        .single();

      if (error) throw error;

      // Insert items
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('gate_pass_items')
          .insert(items.map((item, idx) => ({
            gate_pass_id: data.id,
            serial_number: idx + 1,
            item_details: item.item_details,
            quantity: item.quantity,
            remarks: item.remarks || '',
            is_high_value: item.is_high_value,
          })) as any);
        if (itemsError) throw itemsError;
      }

      // Submission confirmation notification to the requester.
      // One of three notification events tenants are allowed to receive
      // (see filter_tenant_notifications DB trigger). Includes a tracking
      // link to the gate-pass detail page.
      if (user?.id) {
        await supabase.from('notifications').insert({
          user_id: user.id,
          type: 'gatepass_submitted',
          title: 'Gate Pass Submitted',
          message: `Your gate pass ${passNo} has been submitted. Track its progress here: /gate-passes/${data.id}`,
        });
      }

      // Notify the first-step approver(s) — server-side, delegation-aware (WP parity).
      await notifyGatePassApprovers(data.id, passNo);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      toast.success('Gate pass submitted successfully!');
    },
    onError: (error) => {
      toast.error('Failed to submit gate pass: ' + error.message);
    },
  });
}

export function useCompleteGatePass() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();

  return useMutation({
    mutationFn: async (gatePassId: string) => {
      const { error } = await supabase
        .from('gate_passes')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: profile?.full_name || user?.email || 'Unknown',
        })
        .eq('id', gatePassId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      queryClient.invalidateQueries({ queryKey: ['gate-pass'] });
      toast.success('Gate pass marked as completed!');
    },
    onError: (error) => {
      toast.error('Failed to complete gate pass: ' + error.message);
    },
  });
}
