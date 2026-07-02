import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TenantUnit {
  id: string;
  tenant_id: string;
  unit: string;
  floor: string;
  created_at: string;
}

// tenant_units isn't in the generated Supabase types yet (added by the
// 20260702130000 migration). Cast the client for this table only, mirroring
// the existing `as any` pattern used elsewhere for post-migration tables.
const db = supabase as unknown as { from: (t: string) => any };

/** Format a unit for display: "1205 · Floor 12" (or just the unit if no floor). */
export function formatUnit(u: Pick<TenantUnit, 'unit' | 'floor'>): string {
  return u.floor && u.floor.trim() ? `${u.unit} · Floor ${u.floor}` : u.unit;
}

/** Combined "unit / floor" string used by the gate-pass form's single field. */
export function unitFloorString(u: Pick<TenantUnit, 'unit' | 'floor'>): string {
  return u.floor && u.floor.trim() ? `${u.unit} / ${u.floor}` : u.unit;
}

export function useTenantUnits(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ['tenant-units', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<TenantUnit[]> => {
      const { data, error } = await db
        .from('tenant_units')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TenantUnit[];
    },
  });
}

export function useAddTenantUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tenantId: string; unit: string; floor?: string }) => {
      const unit = input.unit.trim();
      if (!unit) throw new Error('Unit is required');
      const { error } = await db.from('tenant_units').insert({
        tenant_id: input.tenantId,
        unit,
        floor: (input.floor ?? '').trim(),
      });
      // 23505 = unique violation (unit already registered) — treat as a no-op.
      if (error && error.code !== '23505') throw error;
      return input.tenantId;
    },
    onSuccess: (tenantId) => {
      qc.invalidateQueries({ queryKey: ['tenant-units', tenantId] });
    },
  });
}

export function useDeleteTenantUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; tenantId: string }) => {
      const { error } = await db.from('tenant_units').delete().eq('id', input.id);
      if (error) throw error;
      return input.tenantId;
    },
    onSuccess: (tenantId) => {
      qc.invalidateQueries({ queryKey: ['tenant-units', tenantId] });
    },
  });
}
