// Fully isolated: mocked HTTP responses only; no users, sessions, production data, or delivery.
// Run: deno test --allow-env --allow-net --node-modules-dir=none supabase/functions/tests/security_pass_two.test.ts
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessError, isServiceBearer, mayPush, requireDocumentAccess } from '../_shared/notification-security.ts';
import { handler as ai } from '../ai-copilot/index.ts';
import { handler as email } from '../send-email-notification/index.ts';
import { handler as push } from '../send-push-notification/index.ts';
import { handler as permitPdf } from '../email-permit-pdf/index.ts';
import { handler as gatePdf } from '../email-gate-pass-pdf/index.ts';
import { handler as dispatch } from '../dispatch-permit-notification/index.ts';

const callerId = '00000000-0000-0000-0000-000000000001';
const otherId = '00000000-0000-0000-0000-000000000002';
const documentId = '00000000-0000-0000-0000-000000000003';
const serviceKey = 'isolated-service-fixture';
Deno.env.set('SUPABASE_URL', 'https://isolated.invalid');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', serviceKey);
Deno.env.set('SUPABASE_ANON_KEY', 'isolated-anon-fixture');

function req(body: unknown = {}, token?: string) {
  return new Request('https://isolated.invalid/action', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
async function mocked(run: () => Promise<void>, route: (url: URL, init?: RequestInit) => Response | Promise<Response> = () => response({ id: callerId, email: 'caller@example.invalid' })) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => route(new URL(input instanceof Request ? input.url : String(input)), init);
  try { await run(); } finally { globalThis.fetch = original; }
}

Deno.test('Service access requires exact configured bearer, not decoded role claims or empty keys', () => {
  assertEquals(isServiceBearer(`Bearer ${serviceKey}`, serviceKey), true);
  assertEquals(isServiceBearer('Bearer browser-fixture', serviceKey), false);
  assertEquals(isServiceBearer('Bearer ', undefined), false);
});
Deno.test('Browser push permits only self, never bulk, another user, omitted or conflicting targets', () => {
  assertEquals(mayPush(false, callerId, callerId, undefined), true);
  assertEquals(mayPush(false, callerId, otherId, undefined), false);
  assertEquals(mayPush(false, callerId, undefined, [callerId]), false);
  assertEquals(mayPush(false, callerId, undefined, undefined), false);
  assertEquals(mayPush(false, callerId, callerId, [otherId]), false);
  assertEquals(mayPush(true, undefined, undefined, [otherId]), true);
});
for (const [name, handler] of [['AI', ai], ['email', email], ['push', push], ['permit PDF', permitPdf], ['gate PDF', gatePdf], ['dispatch', dispatch]] as const) {
  Deno.test(`${name}: missing authentication is rejected before any privileged HTTP`, async () => {
    let calls = 0;
    await mocked(async () => { assertEquals((await handler(req())).status, 401); assertEquals(calls, 0); }, () => { calls++; throw new Error('Unexpected HTTP'); });
  });
}
Deno.test('AI rejects invalid JWT and authenticates before paid gateway access', async () => {
  await mocked(async () => { assertEquals((await ai(req({ messages: [{ role: 'user', content: 'Hi' }] }, 'invalid-fixture'))).status, 401); }, url => {
    assertEquals(url.pathname, '/auth/v1/user'); return response({ message: 'Invalid JWT' }, 401);
  });
});
Deno.test('Email rejects normal browser token before Graph or database access', async () => {
  let calls = 0;
  await mocked(async () => { assertEquals((await email(req({ to: ['external@example.invalid'], subject: 'Abuse' }, 'browser-fixture'))).status, 403); assertEquals(calls, 0); }, () => { calls++; throw new Error('Unexpected HTTP'); });
});
Deno.test('Email service caller reaches validation, preserving trusted server route', async () => {
  assertEquals((await email(req({}, serviceKey))).status, 400);
});
Deno.test('Push rejects cross-user browser target before subscriptions or FCM', async () => {
  await mocked(async () => { assertEquals((await push(req({ userId: otherId, title: 'Abuse', message: 'Abuse' }, 'browser-fixture'))).status, 403); }, url => {
    assertEquals(url.pathname, '/auth/v1/user'); return response({ id: callerId, email: 'caller@example.invalid' });
  });
});
Deno.test('Self-only and service push retain Web Push and native device targeting', async () => {
  Deno.env.set('VAPID_PUBLIC_KEY', 'isolated-fixture');
  Deno.env.set('VAPID_PRIVATE_KEY', 'isolated-fixture');
  Deno.env.set('FCM_SERVICE_ACCOUNT', '{}');
  for (const service of [false, true]) {
    const target = service ? otherId : callerId;
    const queried: string[] = [];
    await mocked(async () => {
      assertEquals((await push(req({ userId: target, title: 'Local fixture', message: 'Local fixture' }, service ? serviceKey : 'browser-fixture'))).status, 200);
      assertEquals(queried.sort(), ['device_tokens', 'push_subscriptions']);
    }, url => {
      if (url.pathname === '/auth/v1/user') return response({ id: callerId, email: 'caller@example.invalid' });
      const table = url.pathname.split('/').at(-1) ?? '';
      assertEquals(['device_tokens', 'push_subscriptions'].includes(table), true);
      assertEquals(url.searchParams.get('user_id'), `eq.${target}`);
      queried.push(table);
      return response([]);
    });
  }
});
Deno.test('Dispatcher rejects injected recipient/body fields even for a valid user', async () => {
  await mocked(async () => { assertEquals((await dispatch(req({ event: 'adhoc_request', permitId: documentId, targetUserId: otherId, to: ['external@example.invalid'] }, 'browser-fixture'))).status, 400); });
});
Deno.test('Dispatcher executes ad-hoc creation as caller, refuses failed current-approver authorization', async () => {
  await mocked(async () => { assertEquals((await dispatch(req({ event: 'adhoc_request', permitId: documentId, targetUserId: otherId }, 'browser-fixture'))).status, 403); }, (url, init) => {
    if (url.pathname === '/auth/v1/user') return response({ id: callerId, email: 'caller@example.invalid' });
    assertEquals(url.pathname, '/rest/v1/rpc/request_additional_approval');
    assertEquals(new Headers(init?.headers).get('Authorization'), 'Bearer browser-fixture');
    return response({ message: 'Only the current approver may request approval', code: '42501' }, 403);
  });
});

function documentClient(options: { admin?: boolean; company?: boolean; requester?: boolean; assigned?: boolean; kind?: 'permit' | 'gatepass'; adhoc?: boolean; delegated?: boolean }) {
  return createClient('https://isolated.invalid', serviceKey, { global: { fetch: async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/work_permits') || url.pathname.endsWith('/gate_passes')) return response({ id: documentId, requester_id: options.requester ? callerId : otherId, status: 'pending_mep' });
    if (url.pathname.endsWith('/has_role')) return response(options.admin === true);
    if (url.pathname.endsWith('/same_company')) return response(options.company === true);
    if (url.pathname.endsWith('/user_roles')) return response([{ role_id: 'role-mep' }]);
    if (url.pathname.endsWith('/permit_approvals') || url.pathname.endsWith('/gate_pass_approvals')) {
      assertEquals(url.searchParams.get(options.kind === 'gatepass' ? 'gate_pass_id' : 'permit_id'), `eq.${documentId}`);
      return response([{ role_id: options.assigned ? 'role-mep' : 'role-other', approver_user_id: null }]);
    }
    if (url.pathname.endsWith('/permit_adhoc_approvals')) return response(options.adhoc ? [{ id: 'local-row' }] : []);
    if (url.pathname.endsWith('/authorize_permit_approval')) return response({ allowed: options.delegated === true });
    if (url.pathname.endsWith('/authorize_gate_pass_approval')) return response(options.delegated === true);
    throw new Error(`Unexpected mocked endpoint ${url.pathname}`);
  } }, auth: { persistSession: false } });
}
for (const kind of ['permit', 'gatepass'] as const) {
  for (const path of ['requester', 'admin', 'company', 'assigned'] as const) {
    Deno.test(`${kind} PDF retains ${path} access on the specific document`, async () => {
      assertEquals((await requireDocumentAccess(documentClient({ [path]: true, kind }), callerId, kind, documentId)).id, documentId);
    });
  }
  Deno.test(`${kind} PDF rejects an approver whose role is only on another document`, async () => {
    await assertRejects(() => requireDocumentAccess(documentClient({ kind }), callerId, kind, documentId), AccessError, 'not authorized');
  });
  Deno.test(`${kind} PDF retains permission-checked active delegate access`, async () => {
    assertEquals((await requireDocumentAccess(documentClient({ kind, delegated: true }), callerId, kind, documentId)).id, documentId);
  });
}
Deno.test('Work permit PDF retains targeted ad-hoc approver access', async () => {
  assertEquals((await requireDocumentAccess(documentClient({ adhoc: true }), callerId, 'permit', documentId)).id, documentId);
});

Deno.test('Work permit PDF rejects arbitrary recipient even for its requester', async () => {
  await mocked(async () => {
    assertEquals((await permitPdf(req({ permitId: documentId, recipients: ['external@example.invalid'] }, 'browser-fixture'))).status, 403);
  }, url => {
    if (url.pathname === '/auth/v1/user') return response({ id: callerId, email: 'caller@example.invalid' });
    if (url.pathname.endsWith('/work_permits')) return response({ id: documentId, requester_id: callerId, requester_email: 'derived@example.invalid' });
    if (url.pathname.endsWith('/has_role')) return response(false);
    if (url.pathname.endsWith('/permit_approvals') || url.pathname.endsWith('/permit_adhoc_approvals')) return response([]);
    if (url.pathname.endsWith('/resolve_user_email')) return response('derived@example.invalid');
    throw new Error(`Unexpected PDF download or sender access: ${url.pathname}`);
  });
});

Deno.test('Gate pass chosen-recipient feature records sender before PDF access', async () => {
  let audited = false;
  await mocked(async () => {
    assertEquals((await gatePdf(req({ gatePassId: documentId, recipientEmail: 'chosen@example.invalid' }, 'browser-fixture'))).status, 404);
    assertEquals(audited, true);
  }, (url, init) => {
    if (url.pathname === '/auth/v1/user') return response({ id: callerId, email: 'caller@example.invalid' });
    if (url.pathname.endsWith('/gate_passes')) return response({ id: documentId, requester_id: callerId, pass_no: 'GP-LOCAL' });
    if (url.pathname.endsWith('/has_role')) return response(false);
    if (url.pathname.endsWith('/user_activity_logs')) {
      const body = JSON.parse(String(init?.body));
      assertEquals(body.user_id, callerId);
      assertEquals(JSON.parse(body.details).recipients, ['chosen@example.invalid']);
      audited = true;
      return response(null, 201);
    }
    if (url.pathname.includes('/storage/')) {
      assertEquals(audited, true);
      return response({ message: 'Mock PDF missing' }, 404);
    }
    throw new Error(`Unexpected PDF endpoint ${url.pathname}`);
  });
});

Deno.test('Public submission confirmation and approval-required service emails still send through Graph', async () => {
  Deno.env.set('MS_TENANT_ID', 'local-fixture');
  Deno.env.set('MS_CLIENT_ID', 'local-fixture');
  Deno.env.set('MS_CLIENT_SECRET', 'local-fixture');
  for (const notificationType of ['permit_submitted', 'approval_required', 'adhoc_resolved']) {
    let delivered = false;
    await mocked(async () => {
      assertEquals((await email(req({ to: ['derived@example.invalid'], subject: 'Local fixture', notificationType, permitNo: 'WP-LOCAL', details: { permitId: documentId, decision: 'approved' } }, serviceKey))).status, 200);
      assertEquals(delivered, true);
    }, (url, init) => {
      if (url.hostname === 'login.microsoftonline.com') return response({ access_token: 'mock-provider-token' });
      if (url.hostname === 'graph.microsoft.com') {
        assertEquals(JSON.parse(String(init?.body)).message.toRecipients, [{ emailAddress: { address: 'derived@example.invalid' } }]);
        delivered = true;
        return response({}, 202);
      }
      if (url.pathname.endsWith('/email_delivery_logs')) return response(null, 201);
      throw new Error(`Unexpected sender endpoint ${url.pathname}`);
    });
  }
});

for (const event of ['adhoc_request', 'adhoc_cancel', 'permit_pending', 'gatepass_pending', 'account_approved', 'account_rejected', 'rework'] as const) {
  Deno.test(`Dispatcher preserves ${event} with trusted server-derived recipients`, async () => {
    const delivered: { name: string; body: any }[] = [];
    const input = event === 'adhoc_request' ? { event, permitId: documentId, targetUserId: otherId, note: 'Review please' }
      : event === 'adhoc_cancel' ? { event, adhocId: documentId }
      : event === 'gatepass_pending' ? { event, gatePassId: documentId }
      : event.startsWith('account_') ? { event, tenantId: otherId }
      : { event, permitId: documentId };
    await mocked(async () => {
      const result = await dispatch(req(input, 'browser-fixture'));
      assertEquals(result.status, 200);
      assertEquals((await result.json()).deliveryWarnings, 0);
      const sentEmail = delivered.find(d => d.name === 'send-email-notification');
      if (event === 'adhoc_cancel') assertEquals(sentEmail, undefined);
      else assertEquals(sentEmail?.body.to, ['derived@example.invalid']);
      if (event === 'adhoc_request' || event === 'adhoc_cancel') {
        assertEquals(delivered.find(d => d.name === 'send-push-notification')?.body.userId, otherId);
      }
      if (event === 'permit_pending' || event === 'gatepass_pending') {
        assertEquals(delivered.find(d => d.name === 'send-push-notification')?.body.userIds, [otherId]);
      }
    }, (url, init) => {
      if (url.pathname === '/auth/v1/user') return response({ id: callerId, email: 'caller@example.invalid' });
      const auth = new Headers(init?.headers).get('Authorization');
      if (url.pathname.includes('/functions/v1/')) {
        assertEquals(auth, `Bearer ${serviceKey}`);
        delivered.push({ name: url.pathname.split('/').at(-1) ?? '', body: JSON.parse(String(init?.body)) });
        return response({ success: true });
      }
      if (url.pathname.endsWith('/request_additional_approval')) {
        assertEquals(auth, 'Bearer browser-fixture');
        return response(documentId);
      }
      if (url.pathname.endsWith('/cancel_additional_approval')) {
        assertEquals(auth, 'Bearer browser-fixture');
        return response(null);
      }
      if (url.pathname.includes('/notify_')) {
        assertEquals(auth, 'Bearer browser-fixture');
        return response({ user_ids: [otherId], emails: ['derived@example.invalid'], permit_no: 'WP-LOCAL', pass_no: 'GP-LOCAL' });
      }
      if (url.pathname.endsWith('/resolve_user_email')) {
        assertEquals(auth, `Bearer ${serviceKey}`);
        return response('derived@example.invalid');
      }
      if (url.pathname.endsWith('/has_role')) return response(true);
      if (url.pathname.endsWith('/permit_adhoc_approvals')) return response({ permit_id: documentId, target_user_id: otherId, request_note: 'Review please' });
      if (url.pathname.endsWith('/work_permits')) return response({ permit_no: 'WP-LOCAL', status: 'rework', requester_id: otherId, rework_comments: 'Recorded reason' });
      if (url.pathname.endsWith('/profiles')) return response({ full_name: 'Local Fixture', account_status: event === 'account_rejected' ? 'rejected' : 'approved', account_reviewed_by: callerId });
      if (url.pathname.endsWith('/activity_logs')) return response([{ id: 'local-action' }]);
      throw new Error(`Unexpected mock endpoint ${url.pathname}`);
    });
  });
}
