import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PendingTenant {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  company_name: string | null;
  created_at: string;
  account_status: 'pending' | 'approved' | 'rejected';
}

const PENDING_TENANTS_KEY = ['pending-tenants'];

/**
 * Fetches profiles whose account_status is 'pending'. Admin-only —
 * relies on the existing "Admins can view all profiles" RLS policy.
 * Rows are sorted oldest-first so admin works through them in order.
 */
export function usePendingTenants() {
  return useQuery({
    queryKey: PENDING_TENANTS_KEY,
    queryFn: async (): Promise<PendingTenant[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, email, full_name, phone, company_name, created_at, account_status'
        )
        .eq('account_status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PendingTenant[];
    },
  });
}

/**
 * Approves a pending tenant: flips account_status to 'approved' and
 * stamps account_approved_at. Records who reviewed (account_reviewed_by)
 * for audit. The viewer must be an admin (UPDATE allowed via "Admins
 * can update all profiles" policy).
 *
 * Sends a bilingual approval email to the tenant on success. The
 * caller passes the tenant's email + name from the existing pending
 * list query so we don't need a second round-trip.
 *
 * Email is best-effort — we log failures but don't fail the whole
 * mutation if the email function errors. The DB update has already
 * landed; the tenant just won't get an email.
 */
export function useApproveTenant() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tenantId,
      tenantEmail,
      tenantName,
    }: {
      tenantId: string;
      tenantEmail: string;
      tenantName?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('profiles')
        .update({
          account_status: 'approved',
          account_approved_at: new Date().toISOString(),
          account_rejected_at: null,
          account_rejection_reason: null,
          account_reviewed_by: user?.id ?? null,
        })
        .eq('id', tenantId);

      if (error) throw error;

      // Best-effort email — don't block / fail on email errors.
      try {
        await supabase.functions.invoke('send-email-notification', {
          body: {
            to: [tenantEmail],
            subject: 'Your Al Hamra tenant account has been approved',
            notificationType: 'account_approved',
            details: {
              tenantName: tenantName ?? '',
            },
          },
        });
      } catch (emailErr) {
        console.error('Approval email failed (non-fatal):', emailErr);
      }

      return tenantId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PENDING_TENANTS_KEY });
      toast.success('Tenant approved');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to approve tenant');
    },
  });
}

/**
 * Rejects a pending tenant: flips account_status to 'rejected' and
 * stamps account_rejected_at + the optional reason. The tenant remains
 * blocked from submission until an admin re-approves them (rejection
 * is reversible by approving from the pending list — though by default
 * rejected accounts no longer appear there; admins can re-list rejected
 * accounts in a future iteration).
 */
export function useRejectTenant() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tenantId,
      tenantEmail,
      tenantName,
      reason,
    }: {
      tenantId: string;
      tenantEmail: string;
      tenantName?: string | null;
      reason?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('profiles')
        .update({
          account_status: 'rejected',
          account_rejected_at: new Date().toISOString(),
          account_rejection_reason: reason?.trim() || null,
          account_reviewed_by: user?.id ?? null,
        })
        .eq('id', tenantId);

      if (error) throw error;

      // Best-effort email.
      try {
        await supabase.functions.invoke('send-email-notification', {
          body: {
            to: [tenantEmail],
            subject: 'Your Al Hamra tenant account application — update',
            notificationType: 'account_rejected',
            details: {
              tenantName: tenantName ?? '',
              reason: reason?.trim() || '',
            },
          },
        });
      } catch (emailErr) {
        console.error('Rejection email failed (non-fatal):', emailErr);
      }

      return tenantId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PENDING_TENANTS_KEY });
      toast.success('Tenant rejected');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to reject tenant');
    },
  });
}
