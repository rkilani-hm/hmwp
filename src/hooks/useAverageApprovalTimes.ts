import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StageAverage {
  stage: string;
  avgHours: number;
}

export function useAverageApprovalTimes() {
  return useQuery({
    queryKey: ['average-approval-times'],
    queryFn: async () => {
      // Get average time for each stage based on historical data
      const { data, error } = await supabase
        .from('work_permits')
        .select('created_at, helpdesk_date, pm_date, pd_date, bdcr_date, mpr_date, it_date, fitout_date, ecovert_supervisor_date, pmd_coordinator_date, status')
        .in('status', ['approved', 'closed']);

      if (error) throw error;

      const stageTotals: Record<string, { total: number; count: number }> = {
        helpdesk: { total: 0, count: 0 },
        pm: { total: 0, count: 0 },
        pd: { total: 0, count: 0 },
        bdcr: { total: 0, count: 0 },
        mpr: { total: 0, count: 0 },
        it: { total: 0, count: 0 },
        fitout: { total: 0, count: 0 },
        ecovert_supervisor: { total: 0, count: 0 },
        pmd_coordinator: { total: 0, count: 0 },
      };

      data?.forEach((permit) => {
        const created = new Date(permit.created_at);
        
        if (permit.helpdesk_date) {
          const hours = (new Date(permit.helpdesk_date).getTime() - created.getTime()) / (1000 * 60 * 60);
          if (hours > 0) {
            stageTotals.helpdesk.total += hours;
            stageTotals.helpdesk.count++;
          }
        }

        const stageSequence = [
          { key: 'pm', date: permit.pm_date, prev: permit.helpdesk_date },
          { key: 'pd', date: permit.pd_date, prev: permit.pm_date || permit.helpdesk_date },
          { key: 'bdcr', date: permit.bdcr_date, prev: permit.pd_date || permit.pm_date || permit.helpdesk_date },
          { key: 'mpr', date: permit.mpr_date, prev: permit.bdcr_date || permit.pd_date || permit.pm_date || permit.helpdesk_date },
          { key: 'it', date: permit.it_date, prev: permit.mpr_date || permit.bdcr_date || permit.pd_date || permit.pm_date || permit.helpdesk_date },
          { key: 'fitout', date: permit.fitout_date, prev: permit.it_date || permit.mpr_date || permit.bdcr_date || permit.pd_date || permit.pm_date || permit.helpdesk_date },
          { key: 'ecovert_supervisor', date: permit.ecovert_supervisor_date, prev: permit.fitout_date || permit.it_date || permit.mpr_date || permit.bdcr_date || permit.pd_date || permit.pm_date || permit.helpdesk_date },
          { key: 'pmd_coordinator', date: permit.pmd_coordinator_date, prev: permit.ecovert_supervisor_date || permit.fitout_date || permit.it_date || permit.mpr_date || permit.bdcr_date || permit.pd_date || permit.pm_date || permit.helpdesk_date },
        ];

        stageSequence.forEach(({ key, date, prev }) => {
          if (date && prev) {
            const hours = (new Date(date).getTime() - new Date(prev).getTime()) / (1000 * 60 * 60);
            if (hours > 0 && hours < 168) { // Ignore outliers > 1 week
              stageTotals[key].total += hours;
              stageTotals[key].count++;
            }
          }
        });
      });

      // Calculate averages with fallback default values
      const defaultHours: Record<string, number> = {
        helpdesk: 4,
        pm: 8,
        pd: 8,
        bdcr: 8,
        mpr: 8,
        it: 4,
        fitout: 8,
        ecovert_supervisor: 8,
        pmd_coordinator: 8,
      };

      const averages: Record<string, number> = {};
      Object.entries(stageTotals).forEach(([stage, { total, count }]) => {
        averages[stage] = count > 0 ? total / count : defaultHours[stage];
      });

      return averages;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
