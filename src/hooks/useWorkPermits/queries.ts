import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import type { WorkPermit, WorkType } from './_shared';

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
            requires_ecovert_supervisor,
            requires_pmd_coordinator
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
            requires_ecovert_supervisor,
            requires_pmd_coordinator
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
    queryKey: ['work-types', user?.id],
    queryFn: async () => {
      // Server-side filtered (list_work_types_for_caller): tenant-only users
      // never receive internal-workflow work types; internal staff get all. The
      // backend insert trigger also rejects a tenant→internal submission, so this
      // is UX — the RPC is the single source for selectable types.
      const { data, error } = await supabase.rpc('list_work_types_for_caller' as any);
      if (error) throw error;
      return (data ?? []) as WorkType[];
    },
    enabled: !!user,
  });
}

// Hook to get pending permits for approver inbox
export function usePendingPermitsForApprover() {
  const { roles, user } = useAuth();

  return useQuery({
    queryKey: ['pending-permits-approver', roles],
    queryFn: async () => {
      if (roles.length === 0) return [];

      // Phase 2c-5b: reads from permit_active_approvers view (backed by
      // the permit_approvals table populated by Phase 2c-5a). The view
      // returns one row per (permit, active-role) combination — only
      // for the permit's CURRENT active step, so a permit appears in
      // PM's inbox only when PM is genuinely the next approver.
      //
      // Two-query flow: first the view to get permit_ids, then a hydrate
      // query to fetch full permit rows with work_types. Only the active
      // ids are fetched, so this is cheaper than the old
      // .in('status', [enum values…]) filter for large permit tables.
      // Resolution is server-side via get_my_inbox_permits(): role-based
      // effective roles (delegation-aware) MINUS permits forwarded away, PLUS
      // permits forwarded TO me. Single source shared with notify + the
      // approval gate — no parallel router.
      const { data: activeRows, error: viewErr } = await supabase
        .rpc('get_my_inbox_permits' as any);

      if (viewErr) throw viewErr;
      const rows = (activeRows as unknown as Array<{ permit_id: string; sla_deadline: string | null }> | null) ?? [];
      if (rows.length === 0) return [];

      // Sort by SLA deadline (soonest first, nulls last), then de-dupe — a
      // permit pending on parallel roles can appear more than once.
      const sorted = [...rows].sort((a, b) => {
        if (a.sla_deadline === b.sla_deadline) return 0;
        if (!a.sla_deadline) return 1;
        if (!b.sla_deadline) return -1;
        return a.sla_deadline < b.sla_deadline ? -1 : 1;
      });
      const seen = new Set<string>();
      const permitIds: string[] = [];
      for (const row of sorted) {
        if (!seen.has(row.permit_id)) {
          seen.add(row.permit_id);
          permitIds.push(row.permit_id);
        }
      }

      const { data: permits, error: hydrateErr } = await supabase
        .from('work_permits')
        .select('*, work_types(*)')
        .in('id', permitIds);

      if (hydrateErr) throw hydrateErr;

      // Preserve the SLA-sorted order from the view query.
      const byId = new Map((permits ?? []).map(p => [p.id as string, p]));
      return permitIds
        .map(id => byId.get(id))
        .filter(Boolean) as WorkPermit[];
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
      if (roles.length === 0) return 0;

      // Phase 2c-5b: count distinct permits that have an active pending
      // row for any of the user's roles. Using count('exact', head:true)
      // on a view returns the raw row count, which could double-count a
      // permit if the user holds multiple roles and the permit is pending
      // on more than one. Acceptable because inbox count is a heuristic —
      // a small over-count is preferable to an additional round trip.
      // Same server-side resolution as the inbox list (forward/delegation aware).
      const { data, error } = await supabase.rpc('get_my_inbox_permits' as any);
      if (error) return 0;
      const ids = new Set(
        ((data as unknown as Array<{ permit_id: string }> | null) ?? []).map((r) => r.permit_id),
      );
      return ids.size;
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

export function usePermitStats() {
  const { data: permits } = useWorkPermits();

  if (!permits) {
    return {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      closed: 0,
      draft: 0,
      cancelled: 0,
      slaBreached: 0,
      urgent: 0,
    };
  }

  return {
    total: permits.length,
    pending: permits.filter(p =>
      p.status.startsWith('pending') ||
      p.status === 'submitted' ||
      p.status === 'under_review' ||
      p.status === 'rework_needed'
    ).length,
    approved: permits.filter(p => p.status === 'approved').length,
    rejected: permits.filter(p => p.status === 'rejected').length,
    closed: permits.filter(p => p.status === 'closed').length,
    draft: permits.filter(p => p.status === 'draft').length,
    cancelled: permits.filter(p => p.status === 'cancelled' || p.status === 'superseded').length,
    slaBreached: permits.filter(p => p.sla_breached).length,
    urgent: permits.filter(p => p.urgency === 'urgent').length,
  };
}
