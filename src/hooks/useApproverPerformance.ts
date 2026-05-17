// useApproverPerformance — Phase 2c read of permit_approvals.
//
// Previously this hook aggregated approver metrics by scanning the
// legacy per-role columns on work_permits (helpdesk_date, pm_date,
// helpdesk_approver_email, …). That hardcoded the role list and
// silently produced empty dashboards for any user whose role was
// added via the dynamic workflow builder (e.g. custom roles like
// `al_hamra_customer_service`).
//
// This rewrite reads from `permit_approvals` — the canonical source
// kept current by the Phase 2b dual-write — and discovers approver
// roles dynamically from workflow_steps + roles. Custom roles work
// automatically.
//
// Response time is computed as `approved_at - permit_approvals.created_at`
// (the approval row is inserted when the permit reaches that step, so
// this represents the time the row sat pending for that approver).
// SLA compliance still uses work_permits.sla_deadline as the deadline.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInMinutes, parseISO, subDays } from 'date-fns';

export interface ApproverMetrics {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  totalDecisions: number;
  approvals: number;
  rejections: number;
  approvalRate: number;
  averageResponseTimeHours: number;
  averageResponseTimeMinutes: number;
  pendingCount: number;
  slaCompliance: number;
  completedOnTime: number;
  completedLate: number;
  last30DaysDecisions: number;
}

interface ApprovalRow {
  permit_id: string;
  role_name: string;
  status: string;
  approver_user_id: string | null;
  approver_email: string | null;
  approved_at: string | null;
  created_at: string;
  work_permits: { sla_deadline: string | null } | null;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string;
}

/**
 * Fetch the set of role names that participate in any workflow
 * (i.e. they appear in at least one workflow_steps row). Falls back
 * to an empty array if the lookup fails so the dashboard still
 * renders even when workflow_steps is empty in a fresh environment.
 */
async function fetchApproverRoleNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('workflow_steps')
    .select('roles:role_id(name)');
  if (error || !data) return [];
  const names = new Set<string>();
  for (const row of data as Array<{ roles: { name: string } | null }>) {
    const n = row.roles?.name;
    if (n) names.add(n);
  }
  return Array.from(names);
}

function computeMetrics(
  approvals: ApprovalRow[],
  pendingCountByRole: Record<string, number>,
  profile: ProfileLite,
  role: string,
): ApproverMetrics {
  const thirtyDaysAgo = subDays(new Date(), 30);
  const metrics: ApproverMetrics = {
    userId: profile.id,
    userName: profile.full_name || 'Unknown',
    userEmail: profile.email,
    role,
    totalDecisions: 0,
    approvals: 0,
    rejections: 0,
    approvalRate: 0,
    averageResponseTimeHours: 0,
    averageResponseTimeMinutes: 0,
    pendingCount: pendingCountByRole[role] || 0,
    slaCompliance: 0,
    completedOnTime: 0,
    completedLate: 0,
    last30DaysDecisions: 0,
  };
  const responseTimes: number[] = [];

  for (const a of approvals) {
    if (a.role_name !== role) continue;
    if (a.status !== 'approved' && a.status !== 'rejected') continue;
    metrics.totalDecisions++;
    if (a.status === 'approved') metrics.approvals++;
    else metrics.rejections++;

    if (a.approved_at) {
      const end = parseISO(a.approved_at);
      const start = parseISO(a.created_at);
      const mins = differenceInMinutes(end, start);
      if (Number.isFinite(mins) && mins >= 0) responseTimes.push(mins);

      const sla = a.work_permits?.sla_deadline;
      if (sla) {
        if (end <= parseISO(sla)) metrics.completedOnTime++;
        else metrics.completedLate++;
      }

      if (end >= thirtyDaysAgo) metrics.last30DaysDecisions++;
    }
  }

  if (responseTimes.length > 0) {
    const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    metrics.averageResponseTimeMinutes = Math.round(avg);
    metrics.averageResponseTimeHours = Math.round((avg / 60) * 10) / 10;
  }
  if (metrics.totalDecisions > 0) {
    metrics.approvalRate = Math.round((metrics.approvals / metrics.totalDecisions) * 100);
  }
  const slaTotal = metrics.completedOnTime + metrics.completedLate;
  if (slaTotal > 0) {
    metrics.slaCompliance = Math.round((metrics.completedOnTime / slaTotal) * 100);
  }
  return metrics;
}

async function fetchPendingCountsByRole(roleNames: string[]): Promise<Record<string, number>> {
  if (roleNames.length === 0) return {};
  const { data, error } = await supabase
    .from('permit_approvals')
    .select('role_name')
    .eq('status', 'pending')
    .in('role_name', roleNames);
  if (error || !data) return {};
  const counts: Record<string, number> = {};
  for (const row of data as Array<{ role_name: string }>) {
    counts[row.role_name] = (counts[row.role_name] || 0) + 1;
  }
  return counts;
}

export interface PerformanceFilters {
  from?: Date | null;
  to?: Date | null;
  /** Restrict admin view to a single role (role_name). Ignored by useMyPerformance. */
  role?: string | null;
}

function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function filterApprovalsByDate(
  approvals: ApprovalRow[],
  from: Date | null | undefined,
  to: Date | null | undefined,
): ApprovalRow[] {
  if (!from && !to) return approvals;
  const fromMs = from ? from.getTime() : -Infinity;
  // Include the full "to" day by pushing to end-of-day if no time component.
  const toMs = to ? new Date(to).setHours(23, 59, 59, 999) : Infinity;
  return approvals.filter((a) => {
    if (!a.approved_at) return false;
    const ms = new Date(a.approved_at).getTime();
    return ms >= fromMs && ms <= toMs;
  });
}

export function useMyPerformance(filters: PerformanceFilters = {}) {
  const { user, roles } = useAuth();
  const { from, to } = filters;

  // Tenants have no business with approver KPIs. Block the query at
  // the hook level so even if route protection ever lapses (race
  // during sign-in, deep link, dev-tools detour), no permit_approvals
  // data leaves the server for a tenant-only user.
  //
  // A user with BOTH tenant AND an approver role still gets their
  // approver metrics — that's intended (they DO act on permits).
  // 'Tenant-only' = no non-tenant role at all.
  const hasApproverRole = roles.some((r) => r !== 'tenant');

  return useQuery({
    queryKey: ['my-performance', user?.id, roles, isoOrNull(from), isoOrNull(to)],
    enabled: !!user && roles.length > 0 && hasApproverRole,
    queryFn: async (): Promise<ApproverMetrics | null> => {
      if (!user) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', user.id)
        .single();

      const approverRoleNames = await fetchApproverRoleNames();
      const role =
        roles.find((r) => approverRoleNames.includes(r)) ||
        roles.find((r) => r !== 'tenant' && r !== 'admin') ||
        roles[0];

      if (!role) return null;

      const { data: approvals, error } = await supabase
        .from('permit_approvals')
        .select(
          'permit_id, role_name, status, approver_user_id, approver_email, approved_at, created_at, work_permits!inner(sla_deadline)'
        )
        .eq('approver_user_id', user.id);

      if (error) throw error;

      const pendingByRole = await fetchPendingCountsByRole([role]);

      const filtered = filterApprovalsByDate(
        (approvals as unknown as ApprovalRow[]) || [],
        from,
        to,
      );

      return computeMetrics(
        filtered,
        pendingByRole,
        {
          id: user.id,
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? user.email ?? '',
        },
        role,
      );
    },
  });
}

export function useAllApproversPerformance(filters: PerformanceFilters = {}) {
  const { user, roles } = useAuth();
  const { from, to, role: roleFilter } = filters;

  return useQuery({
    queryKey: ['all-approvers-performance', isoOrNull(from), isoOrNull(to), roleFilter ?? null],
    enabled: !!user && roles.includes('admin'),
    queryFn: async (): Promise<ApproverMetrics[]> => {
      const approverRoleNames = await fetchApproverRoleNames();
      if (approverRoleNames.length === 0) return [];

      const { data: userRolesRaw, error: urErr } = await supabase
        .from('user_roles')
        .select('user_id, roles:role_id(name)');
      if (urErr) throw urErr;

      const userRolePairs = (userRolesRaw || [])
        .map((ur) => ({
          user_id: ur.user_id as string,
          role: (ur.roles as { name?: string } | null)?.name ?? '',
        }))
        .filter((ur) => ur.role && approverRoleNames.includes(ur.role))
        .filter((ur) => !roleFilter || ur.role === roleFilter);

      if (userRolePairs.length === 0) return [];

      const userIds = [...new Set(userRolePairs.map((u) => u.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      const { data: approvals, error: aErr } = await supabase
        .from('permit_approvals')
        .select(
          'permit_id, role_name, status, approver_user_id, approver_email, approved_at, created_at, work_permits!inner(sla_deadline)'
        )
        .in('approver_user_id', userIds);
      if (aErr) throw aErr;

      const pendingByRole = await fetchPendingCountsByRole(approverRoleNames);
      const allApprovals = filterApprovalsByDate(
        (approvals as unknown as ApprovalRow[]) || [],
        from,
        to,
      );

      const result: ApproverMetrics[] = [];
      for (const { user_id, role } of userRolePairs) {
        const profile = profiles?.find((p) => p.id === user_id);
        if (!profile) continue;
        const userApprovals = allApprovals.filter((a) => a.approver_user_id === user_id);
        result.push(
          computeMetrics(
            userApprovals,
            pendingByRole,
            { id: profile.id, full_name: profile.full_name, email: profile.email },
            role,
          ),
        );
      }

      return result.sort((a, b) => b.totalDecisions - a.totalDecisions);
    },
  });
}

/**
 * Discover all approver role names (those that appear in any workflow_steps row).
 * Exposed for filter dropdowns on the performance dashboards.
 */
export function useApproverRoleNames() {
  return useQuery({
    queryKey: ['approver-role-names'],
    queryFn: fetchApproverRoleNames,
    staleTime: 5 * 60 * 1000,
  });
}

