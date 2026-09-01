import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';
import { parseISO, isPast, differenceInHours, differenceInMinutes, startOfDay, subDays, format } from 'date-fns';

// A permit is "active" (still moving through the approval chain) when its status
// is NOT one of these terminal states. This is defined by exclusion on purpose:
// the workflow generates dynamic, role-based statuses (e.g.
// `pending_head_of_fit_out_unit`) that a hard-coded `pending_*` allow-list could
// never keep up with — the previous allow-list silently dropped every current
// in-flight permit, leaving Breached / At Risk / the SLA-status chart stuck at
// zero even when a permit was past its deadline.
const TERMINAL_STATUSES = ['approved', 'closed', 'rejected', 'cancelled', 'draft'];
const COMPLETED_STATUSES = ['approved', 'closed'];
const isActiveStatus = (s: string) => !TERMINAL_STATUSES.includes(s);

// A permit is "At Risk" when it is inside the last 25% of its OWN SLA window,
// so the warning scales with the configured SLA (≈ last 12h of a 48h window,
// last 1h of a 4h urgent window) instead of a fixed 2-hour sliver. A 2-hour
// floor keeps very short windows from having a near-zero warning band.
const AT_RISK_FRACTION = 0.25;
const AT_RISK_FLOOR_MS = 2 * 60 * 60 * 1000;
function isAtRisk(createdAt: string, deadlineIso: string, now: Date): boolean {
  const deadline = new Date(deadlineIso).getTime();
  const created = new Date(createdAt).getTime();
  const nowMs = now.getTime();
  if (nowMs >= deadline) return false; // already breached, not "at risk"
  const windowMs = Math.max(deadline - created, 0);
  const thresholdMs = Math.max(windowMs * AT_RISK_FRACTION, AT_RISK_FLOOR_MS);
  return (deadline - nowMs) <= thresholdMs;
}

export interface SLAMetrics {
  totalPermits: number;
  breachedPermits: number;
  atRiskPermits: number;
  onTrackPermits: number;
  completedOnTime: number;
  completedLate: number;
  averageResolutionHours: number;
  slaComplianceRate: number;
  urgentPermits: number;
  normalPermits: number;
  // All permits that missed their SLA in the period: still-active past deadline
  // PLUS completed-late. (breachedPermits alone counts only active breaches.)
  totalBreaches: number;
}

export interface BreachedPermit {
  id: string;
  permit_no: string;
  requester_name: string;
  status: string;
  urgency: string;
  sla_deadline: string;
  created_at: string;
  hoursOverdue: number;
  work_types?: { name: string } | null;
}

export interface DailyMetric {
  date: string;
  submitted: number;
  completed: number;
  breached: number;
}

export interface UseSLAStatsOptions {
  /** Inclusive start of created_at filter (ISO date or Date). Optional. */
  dateFrom?: string | Date | null;
  /** Inclusive end of created_at filter (ISO date or Date). Optional. */
  dateTo?: string | Date | null;
}

export function useSLAStats(opts: UseSLAStatsOptions = {}) {
  const { user } = useAuth();
  const { dateFrom, dateTo } = opts;

  const fromIso = dateFrom ? new Date(dateFrom).toISOString() : null;
  const toIso = dateTo ? new Date(dateTo).toISOString() : null;

  const { data: permits, isLoading } = useQuery({
    queryKey: ['sla-permits', fromIso, toIso],
    queryFn: async () => {
      let q = supabase
        .from('work_permits')
        .select(`
          id,
          permit_no,
          status,
          requester_name,
          urgency,
          sla_deadline,
          sla_breached,
          created_at,
          updated_at,
          work_types (name)
        `)
        .order('created_at', { ascending: false });

      if (fromIso) q = q.gte('created_at', fromIso);
      if (toIso) q = q.lte('created_at', toIso);

      const { data, error } = await q;
      if (error) throw error;

      // True completion time = the LAST approval recorded on the permit
      // (max approved_at), not updated_at. updated_at gets bumped by later row
      // touches (PDF regeneration, amendments, archiving), which overstated the
      // resolution time and understated SLA compliance. We resolve the real
      // final-approval timestamp from permit_approvals here.
      const ids = (data ?? []).map((p) => p.id);
      const finalApproved = new Map<string, string>();
      if (ids.length) {
        const { data: appr } = await supabase
          .from('permit_approvals')
          .select('permit_id, approved_at')
          .eq('status', 'approved')
          .in('permit_id', ids);
        for (const a of appr ?? []) {
          if (!a.approved_at) continue;
          const prev = finalApproved.get(a.permit_id);
          if (!prev || a.approved_at > prev) finalApproved.set(a.permit_id, a.approved_at);
        }
      }
      return (data ?? []).map((p) => ({
        ...p,
        final_approved_at: finalApproved.get(p.id) ?? null,
      }));
    },
    enabled: !!user,
  });

  const metrics = useMemo<SLAMetrics>(() => {
    if (!permits) {
      return {
        totalPermits: 0,
        breachedPermits: 0,
        atRiskPermits: 0,
        onTrackPermits: 0,
        completedOnTime: 0,
        completedLate: 0,
        averageResolutionHours: 0,
        slaComplianceRate: 0,
        urgentPermits: 0,
        normalPermits: 0,
        totalBreaches: 0,
      };
    }

    const now = new Date();
    let breachedCount = 0;
    let atRiskCount = 0;
    let onTrackCount = 0;
    let completedOnTime = 0;
    let completedLate = 0;
    let totalResolutionHours = 0;
    let completedCount = 0;

    permits.forEach((permit) => {
      const isActive = isActiveStatus(permit.status);
      const isCompleted = COMPLETED_STATUSES.includes(permit.status);

      if (permit.sla_deadline) {
        const deadline = parseISO(permit.sla_deadline);
        
        if (isActive) {
          if (isPast(deadline)) {
            breachedCount++;
          } else if (isAtRisk(permit.created_at, permit.sla_deadline, now)) {
            atRiskCount++;
          } else {
            onTrackCount++;
          }
        }

        if (isCompleted) {
          // Prefer the real final-approval time; fall back to updated_at only
          // when a permit has no recorded approvals (legacy data).
          const completedAt = parseISO(
            (permit as any).final_approved_at ?? permit.updated_at,
          );
          // Use fractional hours so short resolutions (<1h) don't round to 0
          const resolutionHours =
            (completedAt.getTime() - parseISO(permit.created_at).getTime()) / 3_600_000;
          if (Number.isFinite(resolutionHours) && resolutionHours >= 0) {
            totalResolutionHours += resolutionHours;
            completedCount++;
          }

          // Compute breach live rather than relying on the stored sla_breached flag,
          // which the background job may not have populated for older permits.
          if (completedAt <= deadline) {
            completedOnTime++;
          } else {
            completedLate++;
          }
        }
      } else if (isActive) {
        onTrackCount++; // No SLA deadline, consider on track
      }
    });

    const urgentPermits = permits.filter(p => p.urgency === 'urgent').length;
    const normalPermits = permits.filter(p => p.urgency === 'normal' || !p.urgency).length;
    const totalCompleted = completedOnTime + completedLate;
    const slaComplianceRate = totalCompleted > 0 ? (completedOnTime / totalCompleted) * 100 : 100;
    const averageResolutionHours = completedCount > 0 ? totalResolutionHours / completedCount : 0;

    return {
      totalPermits: permits.length,
      breachedPermits: breachedCount,
      atRiskPermits: atRiskCount,
      onTrackPermits: onTrackCount,
      completedOnTime,
      completedLate,
      averageResolutionHours: Math.round(averageResolutionHours * 10) / 10,
      slaComplianceRate: Math.round(slaComplianceRate * 10) / 10,
      urgentPermits,
      normalPermits,
      totalBreaches: breachedCount + completedLate,
    };
  }, [permits]);

  const breachedPermits = useMemo<BreachedPermit[]>(() => {
    if (!permits) return [];

    const now = new Date();

    return permits
      .filter((permit) => {
        if (!permit.sla_deadline) return false;
        if (!isActiveStatus(permit.status)) return false;
        return isPast(parseISO(permit.sla_deadline));
      })
      .map((permit) => ({
        id: permit.id,
        permit_no: permit.permit_no,
        requester_name: permit.requester_name,
        status: permit.status,
        urgency: permit.urgency || 'normal',
        sla_deadline: permit.sla_deadline!,
        created_at: permit.created_at,
        hoursOverdue: differenceInHours(now, parseISO(permit.sla_deadline!)),
        work_types: permit.work_types,
      }))
      .sort((a, b) => b.hoursOverdue - a.hoursOverdue);
  }, [permits]);

  // Permits that missed their SLA, computed LIVE from sla_deadline (not the
  // stored sla_breached flag, which the breach cron may not have populated).
  // Breached = still active past its deadline, OR completed after its deadline.
  const breachedIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    if (!permits) return ids;
    for (const p of permits) {
      if (!p.sla_deadline) continue;
      const deadline = parseISO(p.sla_deadline);
      if (isActiveStatus(p.status)) {
        if (isPast(deadline)) ids.add(p.id);
      } else if (COMPLETED_STATUSES.includes(p.status)) {
        const completedAt = parseISO((p as any).final_approved_at ?? p.updated_at);
        if (completedAt > deadline) ids.add(p.id);
      }
    }
    return ids;
  }, [permits]);

  // Full breach list for the "SLA Breaches" summary/list: active permits past
  // their deadline AND permits that completed after their deadline (late).
  // hoursOverdue = how far past the deadline (now for active; final-approval
  // time for completed).
  const breachedPermitsAll = useMemo<BreachedPermit[]>(() => {
    if (!permits) return [];
    const now = new Date();
    return permits
      .filter((p) => breachedIds.has(p.id))
      .map((p) => {
        const deadline = parseISO(p.sla_deadline!);
        const endRef = isActiveStatus(p.status)
          ? now
          : parseISO((p as any).final_approved_at ?? p.updated_at);
        return {
          id: p.id,
          permit_no: p.permit_no,
          requester_name: p.requester_name,
          status: p.status,
          urgency: p.urgency || 'normal',
          sla_deadline: p.sla_deadline!,
          created_at: p.created_at,
          hoursOverdue: differenceInHours(endRef, deadline),
          work_types: p.work_types,
        };
      })
      .sort((a, b) => b.hoursOverdue - a.hoursOverdue);
  }, [permits, breachedIds]);

  const atRiskPermits = useMemo<BreachedPermit[]>(() => {
    if (!permits) return [];

    const now = new Date();

    return permits
      .filter((permit) => {
        if (!permit.sla_deadline) return false;
        if (!isActiveStatus(permit.status)) return false;
        return isAtRisk(permit.created_at, permit.sla_deadline, now);
      })
      .map((permit) => {
        const deadline = parseISO(permit.sla_deadline!);
        const minutesRemaining = differenceInMinutes(deadline, now);
        return {
          id: permit.id,
          permit_no: permit.permit_no,
          requester_name: permit.requester_name,
          status: permit.status,
          urgency: permit.urgency || 'normal',
          sla_deadline: permit.sla_deadline!,
          created_at: permit.created_at,
          hoursOverdue: -Math.round(minutesRemaining / 60 * 10) / 10, // Negative for time remaining
          work_types: permit.work_types,
        };
      })
      .sort((a, b) => b.hoursOverdue - a.hoursOverdue); // Closest to breach first
  }, [permits]);

  const dailyMetrics = useMemo<DailyMetric[]>(() => {
    if (!permits) return [];

    const last7Days: DailyMetric[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = subDays(startOfDay(now), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const displayDate = format(date, 'MMM dd');

      const dayPermits = permits.filter((p) => {
        const createdDate = format(parseISO(p.created_at), 'yyyy-MM-dd');
        return createdDate === dateStr;
      });

      const completed = permits.filter((p) => {
        if (!['approved', 'closed'].includes(p.status)) return false;
        const doneAt = (p as any).final_approved_at ?? p.updated_at;
        const doneDate = format(parseISO(doneAt), 'yyyy-MM-dd');
        return doneDate === dateStr;
      });

      const breached = dayPermits.filter((p) => breachedIds.has(p.id));

      last7Days.push({
        date: displayDate,
        submitted: dayPermits.length,
        completed: completed.length,
        breached: breached.length,
      });
    }

    return last7Days;
  }, [permits, breachedIds]);

  return {
    metrics,
    breachedPermits,
    breachedPermitsAll,
    atRiskPermits,
    dailyMetrics,
    breachedIds,
    isLoading,
  };
}