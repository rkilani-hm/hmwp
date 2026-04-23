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
