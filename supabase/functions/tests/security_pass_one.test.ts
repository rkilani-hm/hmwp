// Isolated PostgreSQL regression tests: no production connections,
// auth accounts, JWTs, or sessions. Only synthetic local rows and auth stubs.
// Run: deno test --allow-read --allow-env --allow-net --allow-sys --node-modules-dir=none supabase/functions/tests/security_pass_one.test.ts
import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const db = new PGlite();
await db.exec(`
  CREATE SCHEMA auth;
  CREATE TYPE public.app_role AS ENUM ('admin');
  CREATE ROLE authenticated NOLOGIN;
  CREATE TABLE local_caller (uid uuid, admin boolean, role text);
  INSERT INTO local_caller VALUES ('00000000-0000-0000-0000-000000000001', false, 'authenticated');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT uid FROM public.local_caller';
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS 'SELECT role FROM public.local_caller';
  CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql AS 'SELECT admin FROM public.local_caller';
  CREATE TABLE public.companies (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, name text UNIQUE, created_by uuid);
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, department_id uuid, actor_type text,
    account_status text DEFAULT 'pending', is_active boolean DEFAULT false,
    is_vip boolean DEFAULT false, company_name text, company_id uuid,
    full_name text, phone text, signature text
  );
  CREATE TABLE public.permit_workflow_overrides (id uuid, is_required boolean);
  ALTER TABLE public.permit_workflow_overrides ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Approvers can insert overrides" ON public.permit_workflow_overrides FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "Approvers can delete overrides" ON public.permit_workflow_overrides FOR DELETE TO authenticated USING (true);
  CREATE POLICY "Admins can delete permit_workflow_overrides" ON public.permit_workflow_overrides FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
`);
await db.exec(await Deno.readTextFile(new URL('../../../drizzle/migrations/0011_protect_profile_and_workflow_override_privileges.sql', import.meta.url)));
await db.exec(`
  CREATE TRIGGER profiles_sync_company_id BEFORE INSERT OR UPDATE OF company_name ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_company_id();
  CREATE TRIGGER trg_protect_profile_privileged_columns BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();
  INSERT INTO profiles (id, department_id, actor_type, company_name, full_name, phone, signature)
    VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'approver', 'Original company', 'Original name', '123', 'Original signature');
`);

async function rollbackTest(action: () => Promise<void>) {
  await db.exec('BEGIN');
  try { await action(); } finally { await db.exec('ROLLBACK'); }
}

for (const [column, attempted, expected] of [
  ['account_status', "'approved'", 'pending'],
  ['is_active', 'true', false],
  ['is_vip', 'true', false],
  ['department_id', "'00000000-0000-0000-0000-000000000099'", '00000000-0000-0000-0000-000000000002'],
  ['actor_type', "'reviewer'", 'approver'],
  ['company_name', "'Other company'", 'Original company'],
] as const) {
  Deno.test(`non-admin cannot change ${column}`, () => rollbackTest(async () => {
    const result = await db.query<Record<string, unknown>>(`UPDATE profiles SET ${column} = ${attempted} RETURNING ${column}`);
    assertEquals(result.rows[0][column], expected);
  }));
}

Deno.test('non-admin cannot change company_id directly', () => rollbackTest(async () => {
  const before = await db.query<{company_id: string}>('SELECT company_id FROM profiles');
  const after = await db.query<{company_id: string}>("UPDATE profiles SET company_id = '00000000-0000-0000-0000-000000000099' RETURNING company_id");
  assertEquals(after.rows[0].company_id, before.rows[0].company_id);
}));

Deno.test('company sync creates no company for a blocked UPDATE', () => rollbackTest(async () => {
  await db.exec("UPDATE profiles SET company_name = 'Unexpected company'");
  const result = await db.query<{count: number}>("SELECT count(*)::int AS count FROM companies WHERE name = 'Unexpected company'");
  assertEquals(result.rows[0].count, 0);
}));

Deno.test('normal name phone and signature edits still work', () => rollbackTest(async () => {
  const result = await db.query("UPDATE profiles SET full_name = 'Edited name', phone = '456', signature = 'Edited signature' RETURNING full_name, phone, signature");
  assertEquals(result.rows, [{full_name: 'Edited name', phone: '456', signature: 'Edited signature'}]);
}));

for (const [label, context] of [
  ['admin', 'admin = true'],
  ['service role with a uid', "role = 'service_role'"],
  ['trusted null identity', 'uid = NULL'],
] as const) {
  Deno.test(`${label} keeps account and company control`, () => rollbackTest(async () => {
    await db.exec(`UPDATE local_caller SET ${context}`);
    const result = await db.query("UPDATE profiles SET account_status = 'approved', is_active = true, is_vip = true, company_name = 'Reassigned company' RETURNING account_status, is_active, is_vip, company_name");
    assertEquals(result.rows, [{account_status: 'approved', is_active: true, is_vip: true, company_name: 'Reassigned company'}]);
    const match = await db.query<{count: number}>('SELECT count(*)::int AS count FROM profiles p JOIN companies c ON c.id = p.company_id WHERE c.name = p.company_name');
    assertEquals(match.rows[0].count, 1);
  }));
}

Deno.test('signup INSERT still resolves a company', () => rollbackTest(async () => {
  await db.exec("INSERT INTO profiles (id, company_name) VALUES ('00000000-0000-0000-0000-000000000003', 'Signup company')");
  const result = await db.query<{count: number}>("SELECT count(*)::int AS count FROM profiles p JOIN companies c ON c.id = p.company_id WHERE p.company_name = 'Signup company' AND c.name = 'Signup company'");
  assertEquals(result.rows[0].count, 1);
}));

for (const command of ['INSERT', 'UPDATE', 'DELETE']) {
  Deno.test(`override ${command} policy is admin-only`, async () => {
    const result = await db.query<{qual: string | null; with_check: string | null}>(
      "SELECT qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'permit_workflow_overrides' AND cmd = $1", [command]);
    assertEquals(result.rows.length, 1);
    const guard = "has_role(auth.uid(), 'admin'::app_role)";
    if (command !== 'INSERT') assertEquals(result.rows[0].qual, guard);
    if (command !== 'DELETE') assertEquals(result.rows[0].with_check, guard);
  });
}