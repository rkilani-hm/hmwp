import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export class AccessError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}

export function isServiceBearer(header: string | null, key: string | undefined): boolean {
  return !!key && header?.startsWith('Bearer ') === true && header.slice(7).trim() === key;
}

export async function authenticate(req: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key || !anon) throw new AccessError('Service not configured', 500);
  const header = req.headers.get('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new AccessError('Unauthorized', 401);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  if (isServiceBearer(header, key)) return { admin, service: true, user: null, caller: null };
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new AccessError('Unauthorized', 401);
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: header ?? '' } }, auth: { persistSession: false },
  });
  return { admin, service: false, user, caller };
}

export function mayPush(service: boolean, callerId: string | undefined, userId: unknown, userIds: unknown): boolean {
  // No omitted targets, bulk lists, or conflicting selectors for browser calls.
  return service || (!!callerId && userId === callerId && userIds === undefined);
}

export async function requireDocumentAccess(admin: SupabaseClient, userId: string, kind: 'permit' | 'gatepass', id: string) {
  const table = kind === 'permit' ? 'work_permits' : 'gate_passes';
  const { data: document, error } = await admin.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw new AccessError('Could not verify document access', 500);
  if (!document) throw new AccessError('Document not found', 404);
  const { data: isAdmin, error: adminError } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });
  if (adminError) throw new AccessError('Could not verify permissions', 500);
  if (isAdmin === true || document.requester_id === userId) return document;
  if (document.requester_id) {
    const { data: sameCompany, error: companyError } = await admin.rpc('same_company', { _user_a: userId, _user_b: document.requester_id });
    if (companyError) throw new AccessError('Could not verify company access', 500);
    if (sameCompany === true) return document;
  }
  const fk = kind === 'permit' ? 'permit_id' : 'gate_pass_id';
  const approvalsTable = kind === 'permit' ? 'permit_approvals' : 'gate_pass_approvals';
  const [{ data: roles, error: rolesError }, { data: steps, error: stepsError }] = await Promise.all([
    admin.from('user_roles').select('role_id').eq('user_id', userId),
    admin.from(approvalsTable).select('role_id, approver_user_id').eq(fk, id),
  ]);
  if (rolesError || stepsError) throw new AccessError('Could not verify assigned approvals', 500);
  const roleIds = new Set((roles ?? []).map(r => r.role_id));
  if ((steps ?? []).some(s => s.approver_user_id === userId || roleIds.has(s.role_id))) return document;
  if (kind === 'permit') {
    const { data: adhoc, error: adhocError } = await admin.from('permit_adhoc_approvals').select('id')
      .eq('permit_id', id).eq('target_user_id', userId).neq('status', 'cancelled').limit(1);
    if (adhocError) throw new AccessError('Could not verify requested approval', 500);
    if (adhoc?.length) return document;
    // Active forwarded/delegated approvers retain the action path already authorized by the database.
    const { data: allowed, error: allowedError } = await admin.rpc('authorize_permit_approval', {
      p_user: userId, p_permit_id: id, p_role_name: ['submitted', 'under_review'].includes(document.status) ? 'helpdesk' : String(document.status).replace(/^pending_/, ''),
    });
    if (!allowedError && allowed?.allowed === true) return document;
  } else {
    const { data: allowed, error: allowedError } = await admin.rpc('authorize_gate_pass_approval', {
      p_user: userId, p_gate_pass_id: id, p_role_name: String(document.status).replace(/^pending_/, ''),
    });
    if (!allowedError && allowed === true) return document;
  }
  throw new AccessError('Forbidden — you are not authorized for this document');
}
