// usePerformanceDrilldown — returns the raw approval rows behind the
// metrics shown on /my-performance and /approver-performance, so we can
// render a drill-down table under each stat without re-running the
// aggregation pipeline. Honors the same date/role filters as
// useApproverPerformance and useAllApproversPerformance.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { subDays } from 'date-fns';
import type { PerformanceFilters } from './useApproverPerformance';

export type DrilldownCategory =
  | 'all'
  | 'approved'
  | 'rejected'
  | 'on_time'
  | 'late'
  | 'pending'
  | 'last_30d';

export interface DrilldownRecord {
  approvalId: string;
  permitId: string;
  permitNo: string | null;
  workDescription: string | null;
  permitStatus: string | null;
  roleName: string;
  approvalStatus: string;
  approverUserId: string | null;
  approverName: string | null;
  approverEmail: string | null;
  approvedAt: string | null;
  createdAt: string;
  slaDeadline: string | null;
  responseTimeMinutes: number | null;
  onTime: boolean | null;
  isLast30Days: boolean;
}

interface RawRow {
  id: string;
  permit_id: string;
  role_name: string;
  status: string;
  approver_user_id: string | null;
  approver_name: string | null;
  approver_email: string | null;
  approved_at: string | null;
  created_at: string;
  work_permits: {
    permit_no: string | null;
    work_description: string | null;
    status: string | null;
    sla_deadline: string | null;
  } | null;
}

function toRecord(r: RawRow): DrilldownRecord {
  const sla = r.work_permits?.sla_deadline ?? null;
  let onTime: boolean | null = null;
  let responseTimeMinutes: number | null = null;
  if (r.approved_at) {
    const end = new Date(r.approved_at).getTime();
    const start = new Date(r.created_at).getTime();
    if (Number.isFinite(end) && Number.isFinite(start) && end >= start) {
      responseTimeMinutes = Math.round((end - start) / 60000);
    }
    if (sla) {
      onTime = end <= new Date(sla).getTime();
    }
  }
  const isLast30Days = !!r.approved_at && new Date(r.approved_at) >= subDays(new Date(), 30);
  return {
    approvalId: r.id,
    permitId: r.permit_id,
    permitNo: r.work_permits?.permit_no ?? null,
    workDescription: r.work_permits?.work_description ?? null,
    permitStatus: r.work_permits?.status ?? null,
    roleName: r.role_name,
    approvalStatus: r.status,
    approverUserId: r.approver_user_id,
    approverName: r.approver_name,
    approverEmail: r.approver_email,
    approvedAt: r.approved_at,
    createdAt: r.created_at,
    slaDeadline: sla,
    responseTimeMinutes,
    onTime,
    isLast30Days,
  };
}

const SELECT_COLS =
  'id, permit_id, role_name, status, approver_user_id, approver_name, approver_email, approved_at, created_at, work_permits!inner(permit_no, work_description, status, sla_deadline)';

function inDateRange(approvedAt: string | null, from?: Date | null, to?: Date | null) {
  if (!from && !to) return true;
  if (!approvedAt) return false;
  const ms = new Date(approvedAt).getTime();
  const fromMs = from ? from.getTime() : -Infinity;
  const toMs = to ? new Date(to).setHours(23, 59, 59, 999) : Infinity;
  return ms >= fromMs && ms <= toMs;
}

/**
 * Drill-down records for the signed-in approver. Returns every approval
 * row this user owns, plus any pending rows for their primary approver
 * role (so "Pending" tab shows the inbox-like backlog).
 */
export function useMyPerformanceDrilldown(filters: PerformanceFilters = {}) {
  const { user, roles } = useAuth();
  const { from, to } = filters;

  return useQuery({
    queryKey: ['my-performance-drilldown', user?.id, roles, from?.toISOString() ?? null, to?.toISOString() ?? null],
    enabled: !!user && roles.length > 0,
    queryFn: async (): Promise<DrilldownRecord[]> => {
      if (!user) return [];

      // Decisions made by this user.
      const { data: mine, error } = await supabase
        .from('permit_approvals')
        .select(SELECT_COLS)
        .eq('approver_user_id', user.id);
      if (error) throw error;

      // Pending rows assigned to the user's role (inbox-style backlog).
      // Use roles table to find any role the user is in, then find pending
      // permit_approvals for that role_name.
      const userRoleNames = roles.filter((r) => r !== 'tenant' && r !== 'admin');
      let pending: RawRow[] = [];
      if (userRoleNames.length > 0) {
        const { data: pendingRows } = await supabase
          .from('permit_approvals')
          .select(SELECT_COLS)
          .eq('status', 'pending')
          .in('role_name', userRoleNames);
        pending = (pendingRows as unknown as RawRow[]) || [];
      }

      const combined = [...((mine as unknown as RawRow[]) || []), ...pending];
      // De-dup by approval id (a pending row could overlap if owned).
      const seen = new Set<string>();
      const unique = combined.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      return unique
        .map(toRecord)
        .filter((r) => r.approvalStatus === 'pending' || inDateRange(r.approvedAt, from, to))
        .sort((a, b) => {
          const ad = a.approvedAt || a.createdAt;
          const bd = b.approvedAt || b.createdAt;
          return new Date(bd).getTime() - new Date(ad).getTime();
        });
    },
  });
}

/**
 * Drill-down records for admin view across all approvers, honoring the
 * date and role filters.
 */
export function useAllApproversDrilldown(filters: PerformanceFilters = {}) {
  const { user, roles } = useAuth();
  const { from, to, role: roleFilter } = filters;

  return useQuery({
    queryKey: ['all-approvers-drilldown', from?.toISOString() ?? null, to?.toISOString() ?? null, roleFilter ?? null],
    enabled: !!user && roles.includes('admin'),
    queryFn: async (): Promise<DrilldownRecord[]> => {
      let q = supabase.from('permit_approvals').select(SELECT_COLS);
      if (roleFilter) q = q.eq('role_name', roleFilter);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      const rows = ((data as unknown as RawRow[]) || []).map(toRecord);
      return rows
        .filter((r) => r.approvalStatus === 'pending' || inDateRange(r.approvedAt, from, to))
        .sort((a, b) => {
          const ad = a.approvedAt || a.createdAt;
          const bd = b.approvedAt || b.createdAt;
          return new Date(bd).getTime() - new Date(ad).getTime();
        });
    },
  });
}

export function filterByCategory(
  records: DrilldownRecord[],
  category: DrilldownCategory,
): DrilldownRecord[] {
  switch (category) {
    case 'approved': return records.filter((r) => r.approvalStatus === 'approved');
    case 'rejected': return records.filter((r) => r.approvalStatus === 'rejected');
    case 'on_time': return records.filter((r) => r.onTime === true);
    case 'late': return records.filter((r) => r.onTime === false);
    case 'pending': return records.filter((r) => r.approvalStatus === 'pending');
    case 'last_30d': return records.filter((r) => r.isLast30Days);
    case 'all':
    default: return records.filter((r) => r.approvalStatus !== 'pending');
  }
}
