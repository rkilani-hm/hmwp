import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInHours, differenceInMinutes, parseISO, subDays } from 'date-fns';

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

// Helper to calculate response time between permit submission and approval
function calculateResponseTime(permit: any, role: string): number | null {
  const roleField = role.toLowerCase().replace(' ', '_');
  const approvalDate = permit[`${roleField}_date`];
  
  if (!approvalDate) return null;
  
  // Calculate from when the permit reached this approver's queue
  // For helpdesk, it's from created_at; for others, it's from previous approval
  let startDate: string;
  
  if (role === 'helpdesk') {
    startDate = permit.created_at;
  } else if (role === 'pm') {
    startDate = permit.helpdesk_date || permit.created_at;
  } else if (role === 'pd') {
    startDate = permit.pm_date || permit.helpdesk_date || permit.created_at;
  } else {
    // For other roles, use created_at as fallback
    startDate = permit.created_at;
  }
  
  const start = parseISO(startDate);
  const end = parseISO(approvalDate);
  
  return differenceInMinutes(end, start);
}

export function useMyPerformance() {
  const { user, roles } = useAuth();
  
  return useQuery({
    queryKey: ['my-performance', user?.id, roles],
    queryFn: async () => {
      if (!user || roles.length === 0) return null;
      
      // Get profile info
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();
      
      // Get all permits with decisions by this user
      const { data: permits, error } = await supabase
        .from('work_permits')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const metrics: ApproverMetrics = {
        userId: user.id,
        userName: profile?.full_name || 'Unknown',
        userEmail: profile?.email || user.email || '',
        role: roles[0] || 'unknown',
        totalDecisions: 0,
        approvals: 0,
        rejections: 0,
        approvalRate: 0,
        averageResponseTimeHours: 0,
        averageResponseTimeMinutes: 0,
        pendingCount: 0,
        slaCompliance: 0,
        completedOnTime: 0,
        completedLate: 0,
        last30DaysDecisions: 0,
      };
      
      const responseTimes: number[] = [];
      const thirtyDaysAgo = subDays(new Date(), 30);
      
      // Get approver role for field lookup
      const approverRole = roles.find(r => r !== 'contractor' && r !== 'admin') || roles[0];
      const roleField = approverRole?.toLowerCase().replace(' ', '_');
      
      for (const permit of permits || []) {
        const status = permit[`${roleField}_status`];
        const approverEmail = permit[`${roleField}_approver_email`];
        const approvalDate = permit[`${roleField}_date`];
        const slaDeadline = permit.sla_deadline;
        
        // Check if this user made a decision on this permit
        if (approverEmail === user.email && status) {
          metrics.totalDecisions++;
          
          if (status === 'approved') {
            metrics.approvals++;
          } else if (status === 'rejected') {
            metrics.rejections++;
          }
          
          // Calculate response time
          const responseTime = calculateResponseTime(permit, approverRole);
          if (responseTime !== null) {
            responseTimes.push(responseTime);
          }
          
          // Check SLA compliance
          if (approvalDate && slaDeadline) {
            const decisionDate = parseISO(approvalDate);
            const deadline = parseISO(slaDeadline);
            if (decisionDate <= deadline) {
              metrics.completedOnTime++;
            } else {
              metrics.completedLate++;
            }
          }
          
          // Count last 30 days
          if (approvalDate) {
            const date = parseISO(approvalDate);
            if (date >= thirtyDaysAgo) {
              metrics.last30DaysDecisions++;
            }
          }
        }
      }
      
      // Calculate pending count based on role
      const statusMap: Record<string, string> = {
        helpdesk: 'submitted',
        pm: 'pending_pm',
        pd: 'pending_pd',
        bdcr: 'pending_bdcr',
        mpr: 'pending_mpr',
        it: 'pending_it',
        fitout: 'pending_fitout',
        ecovert_supervisor: 'pending_ecovert_supervisor',
        pmd_coordinator: 'pending_pmd_coordinator',
      };
      
      const pendingStatus = statusMap[approverRole] as any;
      if (pendingStatus) {
        const { count } = await supabase
          .from('work_permits')
          .select('id', { count: 'exact', head: true })
          .eq('status', pendingStatus);
        
        metrics.pendingCount = count || 0;
      }
      
      // Calculate averages
      if (responseTimes.length > 0) {
        const avgMinutes = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        metrics.averageResponseTimeMinutes = Math.round(avgMinutes);
        metrics.averageResponseTimeHours = Math.round(avgMinutes / 60 * 10) / 10;
      }
      
      if (metrics.totalDecisions > 0) {
        metrics.approvalRate = Math.round((metrics.approvals / metrics.totalDecisions) * 100);
      }
      
      if (metrics.completedOnTime + metrics.completedLate > 0) {
        metrics.slaCompliance = Math.round(
          (metrics.completedOnTime / (metrics.completedOnTime + metrics.completedLate)) * 100
        );
      }
      
      return metrics;
    },
    enabled: !!user && roles.length > 0,
  });
}

export function useAllApproversPerformance() {
  const { user, roles } = useAuth();
  
  return useQuery({
    queryKey: ['all-approvers-performance'],
    queryFn: async () => {
      // Get all users with approver roles
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout', 'ecovert_supervisor', 'pmd_coordinator'] as any);
      
      if (rolesError) throw rolesError;
      
      // Get all profiles
      const userIds = [...new Set(userRoles?.map(ur => ur.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      
      // Get all permits
      const { data: permits, error: permitsError } = await supabase
        .from('work_permits')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (permitsError) throw permitsError;
      
      const approverMetrics: ApproverMetrics[] = [];
      const thirtyDaysAgo = subDays(new Date(), 30);
      
      // Process each approver
      for (const userRole of userRoles || []) {
        const profile = profiles?.find(p => p.id === userRole.user_id);
        if (!profile) continue;
        
        const roleField = userRole.role.toLowerCase().replace(' ', '_');
        
        const metrics: ApproverMetrics = {
          userId: userRole.user_id,
          userName: profile.full_name || 'Unknown',
          userEmail: profile.email,
          role: userRole.role,
          totalDecisions: 0,
          approvals: 0,
          rejections: 0,
          approvalRate: 0,
          averageResponseTimeHours: 0,
          averageResponseTimeMinutes: 0,
          pendingCount: 0,
          slaCompliance: 0,
          completedOnTime: 0,
          completedLate: 0,
          last30DaysDecisions: 0,
        };
        
        const responseTimes: number[] = [];
        
        for (const permit of permits || []) {
          const status = permit[`${roleField}_status`];
          const approverEmail = permit[`${roleField}_approver_email`];
          const approvalDate = permit[`${roleField}_date`];
          const slaDeadline = permit.sla_deadline;
          
          if (approverEmail === profile.email && status) {
            metrics.totalDecisions++;
            
            if (status === 'approved') {
              metrics.approvals++;
            } else if (status === 'rejected') {
              metrics.rejections++;
            }
            
            const responseTime = calculateResponseTime(permit, userRole.role);
            if (responseTime !== null) {
              responseTimes.push(responseTime);
            }
            
            if (approvalDate && slaDeadline) {
              const decisionDate = parseISO(approvalDate);
              const deadline = parseISO(slaDeadline);
              if (decisionDate <= deadline) {
                metrics.completedOnTime++;
              } else {
                metrics.completedLate++;
              }
            }
            
            if (approvalDate) {
              const date = parseISO(approvalDate);
              if (date >= thirtyDaysAgo) {
                metrics.last30DaysDecisions++;
              }
            }
          }
        }
        
        // Calculate pending count
        const statusMap: Record<string, string> = {
          helpdesk: 'submitted',
          pm: 'pending_pm',
          pd: 'pending_pd',
          bdcr: 'pending_bdcr',
          mpr: 'pending_mpr',
          it: 'pending_it',
          fitout: 'pending_fitout',
          ecovert_supervisor: 'pending_ecovert_supervisor',
          pmd_coordinator: 'pending_pmd_coordinator',
        };
        
        const pendingStatus = statusMap[userRole.role] as any;
        if (pendingStatus) {
          const { count } = await supabase
            .from('work_permits')
            .select('id', { count: 'exact', head: true })
            .eq('status', pendingStatus);
          
          metrics.pendingCount = count || 0;
        }
        
        // Calculate averages
        if (responseTimes.length > 0) {
          const avgMinutes = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
          metrics.averageResponseTimeMinutes = Math.round(avgMinutes);
          metrics.averageResponseTimeHours = Math.round(avgMinutes / 60 * 10) / 10;
        }
        
        if (metrics.totalDecisions > 0) {
          metrics.approvalRate = Math.round((metrics.approvals / metrics.totalDecisions) * 100);
        }
        
        if (metrics.completedOnTime + metrics.completedLate > 0) {
          metrics.slaCompliance = Math.round(
            (metrics.completedOnTime / (metrics.completedOnTime + metrics.completedLate)) * 100
          );
        }
        
        approverMetrics.push(metrics);
      }
      
      // Sort by total decisions descending
      return approverMetrics.sort((a, b) => b.totalDecisions - a.totalDecisions);
    },
    enabled: !!user && roles.includes('admin'),
  });
}
