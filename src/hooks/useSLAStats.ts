import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';
import { parseISO, isPast, differenceInHours, differenceInMinutes, startOfDay, subDays, format } from 'date-fns';

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

export interface SLAStatsOptions {
  /** ISO date string yyyy-MM-dd; inclusive lower bound on permits.created_at */
  dateFrom?: string;
  /** ISO date string yyyy-MM-dd; inclusive upper bound on permits.created_at */
  dateTo?: string;
}

export function useSLAStats(options: SLAStatsOptions = {}) {
  const { user } = useAuth();

  const { data: permits, isLoading } = useQuery({
    queryKey: ['sla-permits'],
    queryFn: async () => {
      const { data, error } = await supabase
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

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Date-range-filtered subset of permits, shared by all metric
  // useMemos below. When no range is supplied, this is the full set.
  const filteredPermits = useMemo(() => {
    if (!permits) return undefined;
    if (!options.dateFrom && !options.dateTo) return permits;
    return permits.filter((p) => {
      try {
        const created = parseISO(p.created_at);
        if (options.dateFrom && created < startOfDay(parseISO(options.dateFrom))) return false;
        if (options.dateTo) {
          const end = parseISO(options.dateTo);
          end.setHours(23, 59, 59, 999);
          if (created > end) return false;
        }
        return true;
      } catch {
        return false;
      }
    });
  }, [permits, options.dateFrom, options.dateTo]);

  const metrics = useMemo<SLAMetrics>(() => {
    const sourcePermits = filteredPermits;

    if (!sourcePermits) {
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

    const activeStatuses = ['submitted', 'under_review', 'pending_pm', 'pending_pd', 'pending_bdcr', 'pending_mpr', 'pending_it', 'pending_fitout', 'pending_ecovert_supervisor', 'pending_pmd_coordinator'];
    const completedStatuses = ['approved', 'closed'];

    sourcePermits.forEach((permit) => {
      const isActive = activeStatuses.includes(permit.status);
      const isCompleted = completedStatuses.includes(permit.status);

      if (permit.sla_deadline) {
        const deadline = parseISO(permit.sla_deadline);
        
        if (isActive) {
          if (isPast(deadline)) {
            breachedCount++;
          } else {
            const hoursRemaining = differenceInHours(deadline, now);
            if (hoursRemaining <= 2) {
              atRiskCount++;
            } else {
              onTrackCount++;
            }
          }
        }

        if (isCompleted) {
          const completedAt = parseISO(permit.updated_at);
          const resolutionHours = differenceInHours(completedAt, parseISO(permit.created_at));
          totalResolutionHours += resolutionHours;
          completedCount++;

          if (completedAt <= deadline || !permit.sla_breached) {
            completedOnTime++;
          } else {
            completedLate++;
          }
        }
      } else if (isActive) {
        onTrackCount++; // No SLA deadline, consider on track
      }
    });

    const urgentPermits = sourcePermits.filter(p => p.urgency === 'urgent').length;
    const normalPermits = sourcePermits.filter(p => p.urgency === 'normal' || !p.urgency).length;
    const totalCompleted = completedOnTime + completedLate;
    const slaComplianceRate = totalCompleted > 0 ? (completedOnTime / totalCompleted) * 100 : 100;
    const averageResolutionHours = completedCount > 0 ? totalResolutionHours / completedCount : 0;

    return {
      totalPermits: sourcePermits.length,
      breachedPermits: breachedCount,
      atRiskPermits: atRiskCount,
      onTrackPermits: onTrackCount,
      completedOnTime,
      completedLate,
      averageResolutionHours: Math.round(averageResolutionHours * 10) / 10,
      slaComplianceRate: Math.round(slaComplianceRate * 10) / 10,
      urgentPermits,
      normalPermits,
    };
  }, [filteredPermits]);

  const breachedPermits = useMemo<BreachedPermit[]>(() => {
    if (!filteredPermits) return [];

    const now = new Date();
    const activeStatuses = ['submitted', 'under_review', 'pending_pm', 'pending_pd', 'pending_bdcr', 'pending_mpr', 'pending_it', 'pending_fitout', 'pending_ecovert_supervisor', 'pending_pmd_coordinator'];

    return filteredPermits
      .filter((permit) => {
        if (!permit.sla_deadline) return false;
        if (!activeStatuses.includes(permit.status)) return false;
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
  }, [filteredPermits]);

  const atRiskPermits = useMemo<BreachedPermit[]>(() => {
    if (!filteredPermits) return [];

    const now = new Date();
    const activeStatuses = ['submitted', 'under_review', 'pending_pm', 'pending_pd', 'pending_bdcr', 'pending_mpr', 'pending_it', 'pending_fitout', 'pending_ecovert_supervisor', 'pending_pmd_coordinator'];

    return filteredPermits
      .filter((permit) => {
        if (!permit.sla_deadline) return false;
        if (!activeStatuses.includes(permit.status)) return false;
        const deadline = parseISO(permit.sla_deadline);
        if (isPast(deadline)) return false;
        const hoursRemaining = differenceInHours(deadline, now);
        return hoursRemaining <= 2 && hoursRemaining > 0;
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
  }, [filteredPermits]);

  const dailyMetrics = useMemo<DailyMetric[]>(() => {
    if (!filteredPermits) return [];

    const last7Days: DailyMetric[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = subDays(startOfDay(now), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const displayDate = format(date, 'MMM dd');

      const dayPermits = filteredPermits.filter((p) => {
        const createdDate = format(parseISO(p.created_at), 'yyyy-MM-dd');
        return createdDate === dateStr;
      });

      const completed = filteredPermits.filter((p) => {
        if (!['approved', 'closed'].includes(p.status)) return false;
        const updatedDate = format(parseISO(p.updated_at), 'yyyy-MM-dd');
        return updatedDate === dateStr;
      });

      const breached = dayPermits.filter((p) => p.sla_breached);

      last7Days.push({
        date: displayDate,
        submitted: dayPermits.length,
        completed: completed.length,
        breached: breached.length,
      });
    }

    return last7Days;
  }, [filteredPermits]);

  return {
    metrics,
    breachedPermits,
    atRiskPermits,
    dailyMetrics,
    isLoading,
  };
}