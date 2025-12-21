import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useEffect } from 'react';

export interface WorkPermit {
  id: string;
  permit_no: string;
  status: string;
  requester_id: string | null;
  requester_name: string;
  requester_email: string;
  contractor_name: string;
  unit: string;
  floor: string;
  contact_mobile: string;
  work_description: string;
  work_location: string;
  work_date_from: string;
  work_date_to: string;
  work_time_from: string;
  work_time_to: string;
  attachments: string[];
  work_type_id: string | null;
  
  // Approval fields
  helpdesk_status: string | null;
  helpdesk_approver_name: string | null;
  helpdesk_date: string | null;
  helpdesk_comments: string | null;
  helpdesk_signature: string | null;
  
  pm_status: string | null;
  pm_approver_name: string | null;
  pm_date: string | null;
  pm_comments: string | null;
  pm_signature: string | null;
  
  pd_status: string | null;
  pd_approver_name: string | null;
  pd_date: string | null;
  pd_comments: string | null;
  pd_signature: string | null;
  
  bdcr_status: string | null;
  mpr_status: string | null;
  it_status: string | null;
  fitout_status: string | null;
  soft_facilities_status: string | null;
  hard_facilities_status: string | null;
  pm_service_status: string | null;
  
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
  
  // Joined data
  work_types?: {
    id: string;
    name: string;
    requires_pm: boolean;
    requires_pd: boolean;
    requires_bdcr: boolean;
    requires_mpr: boolean;
    requires_it: boolean;
    requires_fitout: boolean;
    requires_soft_facilities: boolean;
    requires_hard_facilities: boolean;
  } | null;
}

export interface WorkType {
  id: string;
  name: string;
  requires_pm: boolean;
  requires_pd: boolean;
  requires_bdcr: boolean;
  requires_mpr: boolean;
  requires_it: boolean;
  requires_fitout: boolean;
  requires_soft_facilities: boolean;
  requires_hard_facilities: boolean;
}

export function useWorkPermits() {
  const { user, isApprover } = useAuth();
  const queryClient = useQueryClient();

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('work-permits-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'work_permits',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['work-permits'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['work-permits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_permits')
        .select(`
          *,
          work_types (
            id,
            name,
            requires_pm,
            requires_pd,
            requires_bdcr,
            requires_mpr,
            requires_it,
            requires_fitout,
            requires_soft_facilities,
            requires_hard_facilities
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as WorkPermit[];
    },
    enabled: !!user,
  });
}

export function useWorkPermit(id: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['work-permit', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('work_permits')
        .select(`
          *,
          work_types (
            id,
            name,
            requires_pm,
            requires_pd,
            requires_bdcr,
            requires_mpr,
            requires_it,
            requires_fitout,
            requires_soft_facilities,
            requires_hard_facilities
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as WorkPermit;
    },
    enabled: !!user && !!id,
  });
}

export function useWorkTypes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['work-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_types')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as WorkType[];
    },
    enabled: !!user,
  });
}

export function useCreatePermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (permitData: {
      contractor_name: string;
      contact_mobile: string;
      unit: string;
      floor: string;
      work_location: string;
      work_type_id: string;
      work_description: string;
      work_date_from: string;
      work_date_to: string;
      work_time_from: string;
      work_time_to: string;
      attachments?: string[];
    }) => {
      // Generate permit number
      const permitNo = `WP-${Date.now().toString(36).toUpperCase()}`;

      const { data, error } = await supabase
        .from('work_permits')
        .insert({
          ...permitData,
          permit_no: permitNo,
          requester_id: user?.id,
          requester_name: profile?.full_name || user?.email || 'Unknown',
          requester_email: user?.email || '',
          status: 'submitted',
        })
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert({
        permit_id: data.id,
        action: 'Permit Created',
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: `Permit ${permitNo} submitted for review`,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      toast.success('Work permit submitted successfully!');
    },
    onError: (error) => {
      toast.error('Failed to submit permit: ' + error.message);
    },
  });
}

export function useApprovePermit() {
  const queryClient = useQueryClient();
  const { user, profile, roles } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      role,
      comments,
      signature,
      approved,
    }: {
      permitId: string;
      role: string;
      comments: string;
      signature: string | null;
      approved: boolean;
    }) => {
      const roleField = role.toLowerCase().replace(' ', '_');
      const approvalStatus = approved ? 'approved' : 'rejected';

      // Build update object dynamically
      const updateData: Record<string, unknown> = {
        [`${roleField}_status`]: approvalStatus,
        [`${roleField}_approver_name`]: profile?.full_name || user?.email,
        [`${roleField}_approver_email`]: user?.email,
        [`${roleField}_date`]: new Date().toISOString(),
        [`${roleField}_comments`]: comments,
        [`${roleField}_signature`]: signature,
      };

      // Update status based on approval flow
      if (!approved) {
        updateData.status = 'rejected';
      }

      const { data, error } = await supabase
        .from('work_permits')
        .update(updateData)
        .eq('id', permitId)
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert({
        permit_id: permitId,
        action: approved ? `${role} Approved` : `${role} Rejected`,
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: comments || undefined,
      });

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      toast.success(variables.approved ? 'Permit approved!' : 'Permit rejected');
    },
    onError: (error) => {
      toast.error('Failed to process approval: ' + error.message);
    },
  });
}

export function usePermitStats() {
  const { data: permits } = useWorkPermits();

  if (!permits) {
    return {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      closed: 0,
    };
  }

  return {
    total: permits.length,
    pending: permits.filter(p => 
      p.status.startsWith('pending') || 
      p.status === 'submitted' || 
      p.status === 'under_review'
    ).length,
    approved: permits.filter(p => p.status === 'approved').length,
    rejected: permits.filter(p => p.status === 'rejected').length,
    closed: permits.filter(p => p.status === 'closed').length,
  };
}
