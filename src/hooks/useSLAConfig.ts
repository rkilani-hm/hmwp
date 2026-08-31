import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// -----------------------------------------------------------------------------
// Admin-facing SLA configuration.
//
// Backed by three tables introduced in 20260830120000_configurable_sla.sql:
//   sla_settings  — singleton global config (clock basis, business window, …)
//   sla_policies  — per (work_type x urgency) SLA hours matrix
//   sla_holidays  — dates the business-hours clock skips
//
// The DB owns the actual deadline math (compute_sla_deadline + trigger); this
// hook is purely the read/write surface for the settings screen. Table/RPC
// names are cast to `any` because they postdate the generated Supabase types.
// -----------------------------------------------------------------------------

export type ClockBasis = 'calendar' | 'business';

export interface SLASettings {
  id: boolean;
  clock_basis: ClockBasis;
  business_start: string;   // 'HH:MM' or 'HH:MM:SS'
  business_end: string;
  working_days: number[];   // 0=Sun .. 6=Sat
  timezone: string;
  default_sla_hours: number;
}

export interface SLAPolicy {
  id: string;
  work_type_id: string;
  urgency: 'normal' | 'urgent';
  hours: number;
}

export interface SLAHoliday {
  id: string;
  holiday_date: string;     // 'YYYY-MM-DD'
  name: string | null;
}

const db = supabase as any;

export function useSLASettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['sla-settings'],
    enabled: !!user,
    queryFn: async (): Promise<SLASettings | null> => {
      const { data, error } = await db
        .from('sla_settings').select('*').eq('id', true).maybeSingle();
      if (error) throw error;
      return (data as SLASettings) ?? null;
    },
  });
}

export function useSLAPolicies() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['sla-policies'],
    enabled: !!user,
    queryFn: async (): Promise<SLAPolicy[]> => {
      const { data, error } = await db.from('sla_policies').select('*');
      if (error) throw error;
      return (data ?? []) as SLAPolicy[];
    },
  });
}

export function useSLAHolidays() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['sla-holidays'],
    enabled: !!user,
    queryFn: async (): Promise<SLAHoliday[]> => {
      const { data, error } = await db
        .from('sla_holidays').select('*').order('holiday_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SLAHoliday[];
    },
  });
}

export function useSaveSLASettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<SLASettings, 'id'>>) => {
      const { error } = await db
        .from('sla_settings')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('SLA settings saved.');
      qc.invalidateQueries({ queryKey: ['sla-settings'] });
    },
    onError: (e: any) => toast.error('Could not save SLA settings: ' + (e?.message || 'unknown error')),
  });
}

/**
 * Upsert or clear one cell of the (work_type x urgency) matrix. A null/blank
 * `hours` deletes the row so that pair falls back to the global default.
 */
export function useSaveSLAPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { work_type_id: string; urgency: 'normal' | 'urgent'; hours: number | null }) => {
      const { work_type_id, urgency, hours } = args;
      if (hours == null || !Number.isFinite(hours) || hours <= 0) {
        const { error } = await db
          .from('sla_policies').delete()
          .eq('work_type_id', work_type_id).eq('urgency', urgency);
        if (error) throw error;
        return;
      }
      const { error } = await db
        .from('sla_policies')
        .upsert(
          { work_type_id, urgency, hours, updated_at: new Date().toISOString() },
          { onConflict: 'work_type_id,urgency' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-policies'] });
    },
    onError: (e: any) => toast.error('Could not save SLA hours: ' + (e?.message || 'unknown error')),
  });
}

export function useAddSLAHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { holiday_date: string; name: string | null }) => {
      const { error } = await db
        .from('sla_holidays')
        .upsert({ holiday_date: args.holiday_date, name: args.name }, { onConflict: 'holiday_date' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Holiday added.');
      qc.invalidateQueries({ queryKey: ['sla-holidays'] });
    },
    onError: (e: any) => toast.error('Could not add holiday: ' + (e?.message || 'unknown error')),
  });
}

export function useRemoveSLAHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('sla_holidays').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-holidays'] });
    },
    onError: (e: any) => toast.error('Could not remove holiday: ' + (e?.message || 'unknown error')),
  });
}
