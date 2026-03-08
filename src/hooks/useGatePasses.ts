import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useEffect } from 'react';
import type { GatePass, GatePassItem } from '@/types/gatePass';

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
      const passNo = `GP-${Date.now().toString(36).toUpperCase()}`;
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

export function useApproveGatePass() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      gatePassId,
      role,
      approved,
      comments,
      signature,
      cctvConfirmed,
    }: {
      gatePassId: string;
      role: string;
      approved: boolean;
      comments?: string;
      signature?: string;
      cctvConfirmed?: boolean;
    }) => {
      // Get current gate pass
      const { data: gp, error: fetchErr } = await supabase
        .from('gate_passes')
        .select('*')
        .eq('id', gatePassId)
        .single();
      if (fetchErr) throw fetchErr;

      const approverName = profile?.full_name || user?.email || 'Unknown';
      const now = new Date().toISOString();

      let updateData: Record<string, any> = {};

      if (!approved) {
        updateData = { status: 'rejected' };
        updateData[`${role}_name`] = approverName;
        updateData[`${role}_date`] = now;
        updateData[`${role}_comments`] = comments || null;
      } else {
        // Set approval fields for the current role (if columns exist)
        const roleColumns = ['store_manager', 'finance', 'security', 'security_pmd', 'cr_coordinator', 'head_cr', 'hm_security_pmd'];
        if (roleColumns.includes(role)) {
          updateData[`${role}_name`] = approverName;
          updateData[`${role}_date`] = now;
          updateData[`${role}_comments`] = comments || null;
          updateData[`${role}_signature`] = signature || null;
          if (role === 'security') {
            updateData.security_cctv_confirmed = cctvConfirmed || false;
          }
          if (role === 'security_pmd' || role === 'hm_security_pmd') {
            // Determine material action based on pass type
            const materialAction = gp.pass_type === 'material_in' ? 'received' : 'released';
            updateData[`${role}_material_action`] = materialAction;
          }
        }

        // Determine next status from workflow mapping
        let nextStatus: string | null = null;
        try {
          const { data: mapping } = await supabase
            .from('gate_pass_type_workflows')
            .select('workflow_template_id')
            .eq('pass_type', gp.pass_type)
            .maybeSingle();

          if (mapping?.workflow_template_id) {
            const { data: steps } = await supabase
              .from('workflow_steps')
              .select('step_order, role:roles(name)')
              .eq('workflow_template_id', mapping.workflow_template_id)
              .order('step_order');

            if (steps && steps.length > 0) {
              // Find the current step index
              const currentIdx = steps.findIndex(s =>
                s.role && typeof s.role === 'object' && 'name' in s.role && (s.role as any).name === role
              );

              if (currentIdx >= 0 && currentIdx < steps.length - 1) {
                // Move to next step
                const nextStep = steps[currentIdx + 1];
                if (nextStep.role && typeof nextStep.role === 'object' && 'name' in nextStep.role) {
                  nextStatus = `pending_${(nextStep.role as any).name}`;
                }
              } else if (currentIdx === steps.length - 1) {
                // Last step - mark approved
                nextStatus = 'approved';
              }
            }
          }
        } catch {
          // Fall through to default logic
        }

        // Default logic if no workflow mapping resolved
        if (!nextStatus) {
          if (role === 'store_manager') {
            nextStatus = gp.has_high_value_asset ? 'pending_finance' : 'pending_security';
          } else if (role === 'finance') {
            nextStatus = 'pending_security';
          } else if (role === 'security') {
            nextStatus = 'approved';
          } else {
            nextStatus = 'approved';
          }
        }

        updateData.status = nextStatus;
      }

      const { error } = await supabase
        .from('gate_passes')
        .update(updateData)
        .eq('id', gatePassId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      queryClient.invalidateQueries({ queryKey: ['gate-pass'] });
      toast.success('Gate pass updated successfully!');
    },
    onError: (error) => {
      toast.error('Failed to update gate pass: ' + error.message);
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
