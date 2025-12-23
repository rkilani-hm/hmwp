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
  
  // Urgency & SLA fields
  urgency: string | null;
  sla_deadline: string | null;
  sla_breached: boolean | null;
  
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
      files?: File[];
      urgency?: 'normal' | 'urgent';
    }) => {
      // Generate permit number
      const permitNo = `WP-${Date.now().toString(36).toUpperCase()}`;
      
      // Calculate SLA deadline based on urgency
      const urgency = permitData.urgency || 'normal';
      const hoursToAdd = urgency === 'urgent' ? 4 : 48;
      const slaDeadline = new Date(Date.now() + hoursToAdd * 60 * 60 * 1000).toISOString();

      // Generate a temporary ID for file uploads
      const tempId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Upload files first if any
      const attachmentPaths: string[] = [];
      if (permitData.files && permitData.files.length > 0) {
        // Import file validation
        const { validateFile } = await import('./useFileUpload');
        
        for (const file of permitData.files) {
          // Validate file before upload
          const validation = validateFile(file);
          if (!validation.valid) {
            toast.error(validation.error);
            continue;
          }

          const fileExt = file.name.split('.').pop()?.toLowerCase();
          const fileName = `${tempId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('permit-attachments')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            toast.error(`Failed to upload ${file.name}: ${uploadError.message}`);
            continue;
          }

          if (uploadData) {
            // Store file path instead of public URL (bucket is now private)
            attachmentPaths.push(fileName);
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { files, ...permitDataWithoutFiles } = permitData;

      const { data, error } = await supabase
        .from('work_permits')
        .insert({
          ...permitDataWithoutFiles,
          permit_no: permitNo,
          requester_id: user?.id,
          requester_name: profile?.full_name || user?.email || 'Unknown',
          requester_email: user?.email || '',
          status: 'submitted',
          urgency,
          sla_deadline: slaDeadline,
          attachments: attachmentPaths,
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
        details: `Permit ${permitNo} submitted for review (${urgency === 'urgent' ? 'URGENT - 4hr SLA' : 'Normal - 48hr SLA'})`,
      });

      // Create notifications for relevant approvers (helpdesk first)
      const { data: helpdeskUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'helpdesk');

      if (helpdeskUsers) {
        for (const hd of helpdeskUsers) {
          await supabase.from('notifications').insert({
            user_id: hd.user_id,
            permit_id: data.id,
            type: 'new_permit',
            title: `New ${urgency === 'urgent' ? 'URGENT ' : ''}Permit Submitted`,
            message: `${permitNo} requires your review. ${urgency === 'urgent' ? '4-hour SLA' : '48-hour SLA'}`,
          });
        }
      }

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

export function useSecureApprovePermit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      permitId,
      role,
      comments,
      signature,
      approved,
      password,
    }: {
      permitId: string;
      role: string;
      comments: string;
      signature: string | null;
      approved: boolean;
      password: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('verify-signature-approval', {
        body: { permitId, role, comments, signature, approved, password },
      });

      // Handle edge function errors - the error message is in data when status is non-2xx
      if (error) {
        // Try to extract error message from data if available
        const errorMessage = data?.error || error.message || 'Failed to process approval';
        throw new Error(errorMessage);
      }
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      toast.success(variables.approved ? 'Permit approved with verified signature!' : 'Permit rejected');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to process approval');
    },
  });
}

// Hook to get pending permits for approver inbox
export function usePendingPermitsForApprover() {
  const { roles, user } = useAuth();
  
  return useQuery({
    queryKey: ['pending-permits-approver', roles],
    queryFn: async () => {
      // Map roles to their pending statuses
      type PermitStatus = 'draft' | 'submitted' | 'under_review' | 'pending_pm' | 'pending_pd' | 'pending_bdcr' | 'pending_mpr' | 'pending_it' | 'pending_fitout' | 'pending_soft_facilities' | 'pending_hard_facilities' | 'pending_pm_service' | 'approved' | 'rejected' | 'closed';
      
      const statusMap: Record<string, PermitStatus> = {
        helpdesk: 'submitted',
        pm: 'pending_pm',
        pd: 'pending_pd',
        bdcr: 'pending_bdcr',
        mpr: 'pending_mpr',
        it: 'pending_it',
        fitout: 'pending_fitout',
        soft_facilities: 'pending_soft_facilities',
        hard_facilities: 'pending_hard_facilities',
        pm_service: 'pending_pm_service',
      };

      const relevantStatuses = roles
        .filter(role => statusMap[role])
        .map(role => statusMap[role]);

      if (relevantStatuses.length === 0) return [];

      const { data, error } = await supabase
        .from('work_permits')
        .select('*, work_types(*)')
        .in('status', relevantStatuses)
        .order('sla_deadline', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return (data || []) as WorkPermit[];
    },
    enabled: roles.length > 0 && !!user,
  });
}

// Hook to get pending permits count for current user's role
export function usePendingPermitsCount() {
  const { roles } = useAuth();
  
  return useQuery({
    queryKey: ['pending-permits-count', roles],
    queryFn: async () => {
      type PermitStatus = 'draft' | 'submitted' | 'under_review' | 'pending_pm' | 'pending_pd' | 'pending_bdcr' | 'pending_mpr' | 'pending_it' | 'pending_fitout' | 'pending_soft_facilities' | 'pending_hard_facilities' | 'pending_pm_service' | 'approved' | 'rejected' | 'closed';
      
      const statusMap: Record<string, PermitStatus> = {
        helpdesk: 'submitted',
        pm: 'pending_pm',
        pd: 'pending_pd',
        bdcr: 'pending_bdcr',
        mpr: 'pending_mpr',
        it: 'pending_it',
        fitout: 'pending_fitout',
        soft_facilities: 'pending_soft_facilities',
        hard_facilities: 'pending_hard_facilities',
        pm_service: 'pending_pm_service',
      };

      const relevantStatuses = roles
        .filter(role => statusMap[role])
        .map(role => statusMap[role]);

      if (relevantStatuses.length === 0) return 0;

      const { count, error } = await supabase
        .from('work_permits')
        .select('*', { count: 'exact', head: true })
        .in('status', relevantStatuses);

      if (error) return 0;
      return count || 0;
    },
    enabled: roles.length > 0,
  });
}

// Extended WorkPermit type for outbox with action metadata
export interface ProcessedWorkPermit extends WorkPermit {
  userAction: 'approved' | 'rejected' | 'forwarded' | 'rework';
  actionDate: string | null;
}

// Hook to get permits that the current approver has processed (for outbox)
export function useProcessedPermitsForApprover() {
  const { roles, user, profile } = useAuth();
  
  return useQuery({
    queryKey: ['processed-permits-approver', user?.id, roles],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get activity logs where current user took action
      const { data: activityLogs, error: logsError } = await supabase
        .from('activity_logs')
        .select('permit_id, action, created_at, details')
        .eq('performed_by_id', user.id)
        .in('action', ['Approved', 'Rejected', 'Forwarded', 'Rework Requested'])
        .order('created_at', { ascending: false });

      if (logsError) throw logsError;
      if (!activityLogs || activityLogs.length === 0) return [];

      // Get unique permit IDs from activity logs
      const permitIds = [...new Set(activityLogs.map(log => log.permit_id))];

      // Fetch permits
      const { data: permits, error: permitsError } = await supabase
        .from('work_permits')
        .select('*, work_types(*)')
        .in('id', permitIds);

      if (permitsError) throw permitsError;

      // Map permits with their action metadata (most recent action by user)
      const processedPermits: ProcessedWorkPermit[] = (permits || []).map(permit => {
        const userLogs = activityLogs.filter(log => log.permit_id === permit.id);
        const latestLog = userLogs[0]; // Already sorted by created_at desc
        
        let userAction: 'approved' | 'rejected' | 'forwarded' | 'rework' = 'approved';
        if (latestLog?.action === 'Rejected') userAction = 'rejected';
        else if (latestLog?.action === 'Forwarded') userAction = 'forwarded';
        else if (latestLog?.action === 'Rework Requested') userAction = 'rework';

        return {
          ...permit,
          userAction,
          actionDate: latestLog?.created_at || null,
        } as ProcessedWorkPermit;
      });

      // Sort by action date (most recent first)
      return processedPermits.sort((a, b) => {
        if (!a.actionDate) return 1;
        if (!b.actionDate) return -1;
        return new Date(b.actionDate).getTime() - new Date(a.actionDate).getTime();
      });
    },
    enabled: !!user?.id && roles.length > 0,
  });
}

// Hook to forward permit to a different approver
export function useForwardPermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  type PermitStatus = 'draft' | 'submitted' | 'under_review' | 'pending_pm' | 'pending_pd' | 'pending_bdcr' | 'pending_mpr' | 'pending_it' | 'pending_fitout' | 'pending_soft_facilities' | 'pending_hard_facilities' | 'pending_pm_service' | 'approved' | 'rejected' | 'closed';
  type AppRole = 'admin' | 'bdcr' | 'contractor' | 'fitout' | 'hard_facilities' | 'helpdesk' | 'it' | 'mpr' | 'pd' | 'pm' | 'pm_service' | 'soft_facilities';

  return useMutation({
    mutationFn: async ({
      permitId,
      targetRole,
      reason,
    }: {
      permitId: string;
      targetRole: AppRole;
      reason: string;
    }) => {
      const statusMap: Record<string, PermitStatus> = {
        helpdesk: 'submitted',
        pm: 'pending_pm',
        pd: 'pending_pd',
        bdcr: 'pending_bdcr',
        mpr: 'pending_mpr',
        it: 'pending_it',
        fitout: 'pending_fitout',
        soft_facilities: 'pending_soft_facilities',
        hard_facilities: 'pending_hard_facilities',
        pm_service: 'pending_pm_service',
      };

      const newStatus = statusMap[targetRole];
      if (!newStatus) throw new Error('Invalid target role');

      const { data, error } = await supabase
        .from('work_permits')
        .update({ status: newStatus })
        .eq('id', permitId)
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert({
        permit_id: permitId,
        action: 'Forwarded',
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: `Forwarded to ${targetRole.toUpperCase()} - ${reason}`,
      });

      // Create notification for target approvers
      const { data: targetUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', targetRole);

      if (targetUsers) {
        for (const tu of targetUsers) {
          await supabase.from('notifications').insert({
            user_id: tu.user_id,
            permit_id: permitId,
            type: 'forwarded',
            title: 'Permit Forwarded to You',
            message: `Permit ${data.permit_no} has been forwarded for your review. Reason: ${reason}`,
          });
        }
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      toast.success('Permit forwarded successfully');
    },
    onError: (error) => {
      toast.error('Failed to forward permit: ' + error.message);
    },
  });
}

// Hook to send permit back for rework
export function useRequestRework() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      reason,
    }: {
      permitId: string;
      reason: string;
    }) => {
      const { data, error } = await supabase
        .from('work_permits')
        .update({ status: 'draft' })
        .eq('id', permitId)
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert({
        permit_id: permitId,
        action: 'Rework Requested',
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: reason,
      });

      // Notify the requester
      if (data.requester_id) {
        await supabase.from('notifications').insert({
          user_id: data.requester_id,
          permit_id: permitId,
          type: 'rework_requested',
          title: 'Rework Requested',
          message: `Your permit ${data.permit_no} requires changes. Reason: ${reason}`,
        });
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      toast.success('Permit sent back for rework');
    },
    onError: (error) => {
      toast.error('Failed to request rework: ' + error.message);
    },
  });
}

// Hook to cancel a permit (only by creator)
export function useCancelPermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      reason,
    }: {
      permitId: string;
      reason: string;
    }) => {
      // First verify the user is the creator
      const { data: permit } = await supabase
        .from('work_permits')
        .select('requester_id, permit_no')
        .eq('id', permitId)
        .single();

      if (!permit) throw new Error('Permit not found');
      if (permit.requester_id !== user?.id) {
        throw new Error('You can only cancel permits you created');
      }

      const { data, error } = await supabase
        .from('work_permits')
        .update({ status: 'cancelled' })
        .eq('id', permitId)
        .eq('requester_id', user?.id) // Extra safety check
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert({
        permit_id: permitId,
        action: 'Cancelled',
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: reason || 'Cancelled by requester',
      });

      // Notify approvers that the permit was cancelled
      const { data: helpdeskUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'helpdesk');

      if (helpdeskUsers) {
        for (const hd of helpdeskUsers) {
          await supabase.from('notifications').insert({
            user_id: hd.user_id,
            permit_id: permitId,
            type: 'cancelled',
            title: 'Permit Cancelled',
            message: `Permit ${permit.permit_no} has been cancelled by the requester.`,
          });
        }
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      toast.success('Permit cancelled successfully');
    },
    onError: (error) => {
      toast.error('Failed to cancel permit: ' + error.message);
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
      slaBreached: 0,
      urgent: 0,
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
    slaBreached: permits.filter(p => p.sla_breached).length,
    urgent: permits.filter(p => p.urgency === 'urgent').length,
  };
}
