import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { authenticate, AccessError } from '../_shared/notification-security.ts';

// No recipient, subject, or body fields are accepted from the browser.
const schema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('adhoc_request'), permitId: z.string().uuid(), targetUserId: z.string().uuid(), note: z.string().max(4000).optional() }).strict(),
  z.object({ event: z.literal('adhoc_cancel'), adhocId: z.string().uuid() }).strict(),
  z.object({ event: z.literal('permit_pending'), permitId: z.string().uuid(), notificationType: z.enum(['new_permit', 'resubmitted']).default('new_permit') }).strict(),
  z.object({ event: z.literal('gatepass_pending'), gatePassId: z.string().uuid() }).strict(),
  z.object({ event: z.literal('rework'), permitId: z.string().uuid() }).strict(),
  z.object({ event: z.enum(['account_approved', 'account_rejected']), tenantId: z.string().uuid() }).strict(),
]);
const bursts = new Map<string, number[]>();

export const handler = async (req: Request) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return json({});
  try {
    const { admin, user, caller } = await authenticate(req);
    if (!user || !caller) throw new AccessError('A signed-in user is required', 401);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Invalid notification action', details: parsed.error.flatten() }, 400);
    const v = parsed.data;
    const now = Date.now();
    const hits = (bursts.get(user.id) ?? []).filter(t => now - t < 60000);
    if (hits.length >= 10) throw new AccessError('Too many notification requests', 429);
    bursts.set(user.id, [...hits, now]);
    const deliveries: Promise<unknown>[] = [];
    const email = (body: object) => deliveries.push(admin.functions.invoke('send-email-notification', { body }));
    const push = (body: object) => deliveries.push(admin.functions.invoke('send-push-notification', { body }));
    const rpc = async (name: string, args: object) => {
      // Execute as the authenticated caller: preserve existing permission checks.
      const { data, error } = await caller.rpc(name, args);
      if (error) throw new AccessError(error.message);
      return data;
    };
    const resolveEmail = async (id: string) => {
      const { data, error } = await admin.rpc('resolve_user_email', { p_user_id: id });
      if (error) throw new AccessError('Could not resolve recipient', 500);
      return data;
    };
    let result: unknown = null;
    if (v.event === 'adhoc_request' || v.event === 'adhoc_cancel') {
      let id: string;
      if (v.event === 'adhoc_request') {
        id = await rpc('request_additional_approval', { p_permit_id: v.permitId, p_target_user_id: v.targetUserId, p_note: v.note || null });
        result = id;
      } else {
        await rpc('cancel_additional_approval', { p_adhoc_id: v.adhocId });
        id = v.adhocId;
      }
      const { data: row, error } = await admin.from('permit_adhoc_approvals').select('*').eq('id', id).single();
      if (error || !row) throw new AccessError('Request could not be read', 500);
      const { data: permit } = await admin.from('work_permits').select('permit_no').eq('id', row.permit_id).single();
      const { data: profile } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      const name = profile?.full_name || user.email || 'Approver';
      const requested = v.event === 'adhoc_request';
      const title = requested ? 'Approval requested' : 'Approval request withdrawn';
      const message = requested ? `You have been asked to approve ${permit?.permit_no} by ${name}` : `${name} withdrew the approval request on ${permit?.permit_no} — no action needed`;
      push({ userId: row.target_user_id, title, message, data: { permitId: row.permit_id, url: `/permits/${row.permit_id}` } });
      if (requested) {
        const to = await resolveEmail(row.target_user_id);
        if (to) email({ to: [to], notificationType: 'adhoc_requested', subject: `Approval requested: ${permit?.permit_no}`, permitId: row.permit_id, permitNo: permit?.permit_no, details: { permitId: row.permit_id, requesterName: name, note: row.request_note || '' } });
      }
    } else if (v.event === 'permit_pending' || v.event === 'gatepass_pending') {
      const isPermit = v.event === 'permit_pending';
      const id = isPermit ? v.permitId : v.gatePassId;
      const p = await rpc(isPermit ? 'notify_permit_active_approvers' : 'notify_gate_pass_active_approvers', isPermit
        ? { p_permit_id: id, p_notification_type: v.notificationType }
        : { p_gate_pass_id: id, p_notification_type: 'gatepass_pending' });
      const no = p?.permit_no || p?.pass_no || '';
      if (p?.user_ids?.length) push({ userIds: p.user_ids, title: 'Approval required', message: `${no} requires your review`, data: isPermit ? { permitId: id, url: '/inbox' } : { gatePassId: id, url: '/gate-passes/approvals' } });
      if (p?.emails?.length) email({ to: p.emails, notificationType: isPermit ? 'new_permit' : 'approval_required', subject: `${isPermit ? 'Work Permit' : 'Gate Pass'} Awaiting Review: ${no}`, permitId: isPermit ? id : undefined, permitNo: no, details: { permitId: isPermit ? id : undefined, requesterName: p.requester_name, urgency: p.urgency } });
    } else if (v.event === 'rework') {
      // Require the recorded action by this caller; a global approver role is insufficient.
      const { data: permit } = await admin.from('work_permits').select('permit_no, status, requester_id, requester_email, rework_comments').eq('id', v.permitId).single();
      const { data: action } = await admin.from('activity_logs').select('id').eq('permit_id', v.permitId).eq('performed_by_id', user.id).eq('action', 'Rework Requested').gte('created_at', new Date(now - 10 * 60000).toISOString()).limit(1);
      if (!permit || permit.status !== 'rework_needed' || !action?.length) throw new AccessError('No authorized rework action to notify');
      const to = permit.requester_id ? await resolveEmail(permit.requester_id) : permit.requester_email;
      if (to) email({ to: [to], notificationType: 'rework', subject: `Work Permit Rework Required: ${permit.permit_no}`, permitId: v.permitId, permitNo: permit.permit_no, details: { permitId: v.permitId, comments: permit.rework_comments } });
    } else {
      const { data: isAdmin, error } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (error || isAdmin !== true) throw new AccessError('Admin permission required');
      const { data: tenant } = await admin.from('profiles').select('full_name, account_status, account_reviewed_by, account_rejection_reason').eq('id', v.tenantId).single();
      const expected = v.event === 'account_approved' ? 'approved' : 'rejected';
      if (!tenant || tenant.account_status !== expected || tenant.account_reviewed_by !== user.id) throw new AccessError('No matching account review');
      const to = await resolveEmail(v.tenantId);
      if (to) email({ to: [to], notificationType: v.event, subject: expected === 'approved' ? 'Your Al Hamra tenant account has been approved' : 'Your Al Hamra tenant account application — update', details: { tenantName: tenant.full_name || '', reason: tenant.account_rejection_reason || '' } });
    }
    // Await dispatch before ending the request; committed decisions never roll back for provider failures.
    const outcomes = await Promise.allSettled(deliveries);
    const failed = outcomes.filter(o => o.status === 'rejected' || (o.status === 'fulfilled' && (o.value as { error?: unknown })?.error));
    if (failed.length) console.error('Notification delivery failed', failed.length);
    return json({ success: true, result, deliveryWarnings: failed.length });
  } catch (error) {
    console.error('Notification action failed:', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: error instanceof AccessError ? error.message : 'Internal server error' }, error instanceof AccessError ? error.status : 500);
  }
};
if (import.meta.main) Deno.serve(handler);
