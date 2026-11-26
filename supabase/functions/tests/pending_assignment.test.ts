// Isolated PostgreSQL: synthetic local rows only; no production sessions or writes.
// Run: deno test --allow-read --allow-env --allow-net --allow-sys --node-modules-dir=none supabase/functions/tests/pending_assignment.test.ts
import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const db = new PGlite();
const permitId = '00000000-0000-0000-0000-000000000010';
const requesterId = '00000000-0000-0000-0000-000000000002';
await db.exec(`
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE TYPE public.app_role AS ENUM ('admin');
  CREATE TYPE public.permit_status AS ENUM ('draft','submitted','pending_pm','rework_needed','rejected','approved','cancelled','closed');
  CREATE TABLE local_caller (uid uuid, admin boolean, on_behalf boolean, role text);
  INSERT INTO local_caller VALUES ('00000000-0000-0000-0000-000000000001',false,false,'authenticated');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT uid FROM public.local_caller';
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS 'SELECT role FROM public.local_caller';
  CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql AS 'SELECT admin FROM public.local_caller';
  CREATE FUNCTION public.can_submit_on_behalf(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT on_behalf FROM public.local_caller';
  CREATE TABLE public.work_types (id uuid PRIMARY KEY, workflow_template_id uuid);
  CREATE TABLE public.work_permits (id uuid PRIMARY KEY, requester_id uuid, work_type_id uuid, status public.permit_status, is_archived boolean DEFAULT false);
  CREATE TABLE public.roles (id uuid PRIMARY KEY, name text);
  CREATE TABLE public.workflow_steps (id uuid PRIMARY KEY, role_id uuid, step_order integer, is_required_default boolean, workflow_template_id uuid);
  CREATE TABLE public.permit_workflow_overrides (permit_id uuid, workflow_step_id uuid, is_required boolean);
  CREATE TABLE public.work_type_step_config (work_type_id uuid, workflow_step_id uuid, is_required boolean);
  CREATE TABLE public.permit_approvals (permit_id uuid, workflow_step_id uuid, role_id uuid, role_name text, status text, updated_at timestamptz, UNIQUE(permit_id,role_name));
  INSERT INTO public.roles VALUES ('00000000-0000-0000-0000-000000000020','pm');
  INSERT INTO public.work_types VALUES ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000040');
  INSERT INTO public.workflow_steps VALUES ('00000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000020',1,true,'00000000-0000-0000-0000-000000000040');
  INSERT INTO public.work_permits VALUES ('${permitId}','${requesterId}','00000000-0000-0000-0000-000000000030','submitted',false);
  GRANT USAGE ON SCHEMA auth TO authenticated;
  GRANT SELECT ON public.local_caller TO authenticated;
  GRANT SELECT, UPDATE ON public.work_permits TO authenticated;
  ALTER TABLE public.work_permits ENABLE ROW LEVEL SECURITY;
  CREATE POLICY approver_update ON public.work_permits FOR UPDATE TO authenticated USING (auth.uid()='00000000-0000-0000-0000-000000000001'::uuid);
  CREATE POLICY approver_read ON public.work_permits FOR SELECT TO authenticated USING (true);
`);

// Reproduce the original trigger failure using the actual former implementation.
const former = await Deno.readTextFile(new URL('../../../drizzle/migrations/0009_harden_high_risk_security_definer_functions.sql', import.meta.url));
const start = former.indexOf('CREATE OR REPLACE FUNCTION public.ensure_permit_pending_approvals');
const end = former.indexOf('CREATE OR REPLACE FUNCTION public.upsert_contractor');
await db.exec(former.slice(start, end));
await db.exec(`
  CREATE FUNCTION public._trg_permit_ensure_pending() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN PERFORM public.ensure_permit_pending_approvals(NEW.id); RETURN NEW; END; $$;
  CREATE TRIGGER work_permits_ensure_pending AFTER INSERT OR UPDATE OF status,work_type_id ON public.work_permits FOR EACH ROW WHEN (NEW.status <> 'draft') EXECUTE FUNCTION public._trg_permit_ensure_pending();
`);
await assertRejects(() => db.exec(`SET ROLE authenticated; UPDATE public.work_permits SET status='rework_needed' WHERE id='${permitId}';`), Error, 'permission denied');
await db.exec('RESET ROLE');
await db.exec(await Deno.readTextFile(new URL('../../../drizzle/migrations/0013_separate_trusted_pending_approval_assignment.sql', import.meta.url)));
await db.exec(await Deno.readTextFile(new URL('../../../drizzle/migrations/0014_use_private_assignment_for_workflow_trigger.sql', import.meta.url)));
await db.exec('CREATE TRIGGER workflow_steps_reassign AFTER UPDATE ON public.workflow_steps FOR EACH ROW EXECUTE FUNCTION public._trg_workflow_step_reassign()');

async function rollbackTest(run: () => Promise<void>) {
  await db.exec('BEGIN');
  try { await run(); } finally { await db.exec('ROLLBACK; RESET ROLE'); }
}

for (const [flow, status] of [['forward','pending_pm'],['rework','rework_needed'],['reject','rejected']] as const) {
  Deno.test(`ordinary approver ${flow} survives the pending-assignment trigger`, () => rollbackTest(async () => {
    await db.exec(`SET ROLE authenticated; UPDATE public.work_permits SET status='${status}' WHERE id='${permitId}'; RESET ROLE;`);
    assertEquals((await db.query<{status: string}>('SELECT status FROM public.work_permits')).rows[0].status, status);
    assertEquals((await db.query('SELECT role_name,status FROM public.permit_approvals')).rows, [{role_name:'pm',status:'pending'}]);
  }));
}
Deno.test('ordinary approver cannot invoke the direct assignment RPC', () => rollbackTest(async () => {
  await assertRejects(() => db.exec(`SET ROLE authenticated; SELECT public.ensure_permit_pending_approvals('${permitId}')`), Error, 'permission denied');
}));
Deno.test('private helper is denied to anon and authenticated, retained for service', async () => {
  const result = await db.query("SELECT has_function_privilege('anon','public._ensure_permit_pending_approvals_internal(uuid)','EXECUTE') AS anon, has_function_privilege('authenticated','public._ensure_permit_pending_approvals_internal(uuid)','EXECUTE') AS authenticated, has_function_privilege('service_role','public._ensure_permit_pending_approvals_internal(uuid)','EXECUTE') AS service");
  assertEquals(result.rows, [{anon:false,authenticated:false,service:true}]);
});
for (const [label, context] of [['requester',`uid='${requesterId}'`],['admin','admin=true'],['on-behalf staff','on_behalf=true'],['service',"uid=NULL,role='service_role'"]] as const) {
  Deno.test(`${label} retains direct assignment access`, () => rollbackTest(async () => {
    await db.exec(`UPDATE local_caller SET ${context}`);
    const result = await db.query<{inserted:number}>(`SELECT public.ensure_permit_pending_approvals('${permitId}') AS inserted`);
    assertEquals(result.rows[0].inserted,1);
  }));
}
Deno.test('trusted workflow trigger works without a client identity', () => rollbackTest(async () => {
  await db.exec('UPDATE local_caller SET uid=NULL, role=NULL; UPDATE public.workflow_steps SET step_order=2');
  assertEquals((await db.query('SELECT role_name,status FROM public.permit_approvals')).rows,[{role_name:'pm',status:'pending'}]);
}));
Deno.test('workflow changes leave closed permits and settled approvals untouched', () => rollbackTest(async () => {
  await db.exec(`UPDATE public.work_permits SET status='closed'; UPDATE public.permit_approvals SET status='approved'; UPDATE local_caller SET uid=NULL,role=NULL; UPDATE public.workflow_steps SET is_required_default=false`);
  assertEquals((await db.query('SELECT status FROM public.work_permits')).rows,[{status:'closed'}]);
  assertEquals((await db.query('SELECT role_name,status FROM public.permit_approvals')).rows,[{role_name:'pm',status:'approved'}]);
}));