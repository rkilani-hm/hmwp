// Security / RLS invariants test suite.
//
// See ./README.md for the full list of invariants and how to run.
//
// Run:
//   deno test --allow-net --allow-env --allow-read \
//     supabase/functions/tests/security_invariants.test.ts
//
// Requires SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in env
// (or the VITE_* equivalents from the project .env).

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// ---------------------------------------------------------------------------
// Config + safety guard
// ---------------------------------------------------------------------------

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Refuse to run against production. Extend this list for your deployment.
const PRODUCTION_HOSTS_DENYLIST: string[] = [
  "hmwp.alhamra.com.kw",
  "hmwp.lovable.app",
];

function assertSafeTarget() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY. " +
        "This suite must be run against a staging database with a service-role key available.",
    );
  }
  for (const host of PRODUCTION_HOSTS_DENYLIST) {
    if (SUPABASE_URL.includes(host)) {
      throw new Error(`Refusing to run security tests against production host: ${host}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Fixture seeding
// ---------------------------------------------------------------------------

interface Fixture {
  admin: SupabaseClient;
  tenantA: { id: string; email: string; client: SupabaseClient };
  tenantB: { id: string; email: string; client: SupabaseClient };
  adminUser: { id: string; email: string; client: SupabaseClient };
  permitA: { id: string; permit_no: string };
  permitB: { id: string; permit_no: string };
  permitANonDraft: { id: string; permit_no: string };
}

const FIXTURE_PREFIX = "rls-test";
const PASSWORD = "Rls-Test-Passw0rd!";

async function seed(): Promise<Fixture> {
  assertSafeTarget();
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stamp = Date.now();
  const make = async (label: string, role: "tenant" | "admin") => {
    const email = `${FIXTURE_PREFIX}-${label}-${stamp}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `${label} fixture`, admin_created: "true" },
    });
    if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);

    // handle_new_user trigger inserts profile + tenant role. For admin
    // fixture replace the role.
    if (role === "admin") {
      await admin.from("user_roles").delete().eq("user_id", data.user.id);
      const { data: r } = await admin.from("roles").select("id").eq("name", "admin").single();
      if (!r) throw new Error("admin role missing from roles table");
      await admin.from("user_roles").insert({ user_id: data.user.id, role_id: r.id });
    }

    // Sign in to get a JWT-bound client.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password: PASSWORD });
    if (signInErr) throw new Error(`signIn(${label}): ${signInErr.message}`);
    return { id: data.user.id, email, client: userClient };
  };

  const tenantA = await make("tenantA", "tenant");
  const tenantB = await make("tenantB", "tenant");
  const adminUser = await make("admin", "admin");

  // Insert two permits (one per tenant) via service role so we don't have to
  // fight the dropped anon-insert policy. Mark them non-internal.
  const today = new Date().toISOString().slice(0, 10);
  const mkPermit = async (ownerId: string, status: string) => {
    const { data, error } = await admin
      .from("work_permits")
      .insert({
        requester_id: ownerId,
        requester_name: `fixture ${ownerId.slice(0, 6)}`,
        requester_email: `fixture-${ownerId.slice(0, 6)}@example.invalid`,
        contractor_name: "Fixture Co",
        work_description: "rls-test fixture",
        work_date_from: today,
        work_date_to: today,
        work_time_from: "09:00",
        work_time_to: "17:00",
        urgency: "normal",
        status,
      })
      .select("id, permit_no")
      .single();
    if (error || !data) throw new Error(`mkPermit: ${error?.message}`);
    return data as { id: string; permit_no: string };
  };

  const permitA = await mkPermit(tenantA.id, "draft");
  const permitB = await mkPermit(tenantB.id, "draft");
  const permitANonDraft = await mkPermit(tenantA.id, "under_review");

  return { admin, tenantA, tenantB, adminUser, permitA, permitB, permitANonDraft };
}

async function teardown(f: Fixture) {
  const ids = [f.permitA.id, f.permitB.id, f.permitANonDraft.id];
  await f.admin.from("work_permits").delete().in("id", ids);
  for (const u of [f.tenantA, f.tenantB, f.adminUser]) {
    try {
      await f.admin.auth.admin.deleteUser(u.id);
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Shared fixture across the test file (seeded once, torn down once).
// ---------------------------------------------------------------------------

let FIX: Fixture | null = null;
async function getFix(): Promise<Fixture> {
  if (!FIX) FIX = await seed();
  return FIX;
}

// Final teardown — runs as the last test so we don't need a non-standard hook.
addEventListener("unload", () => {
  if (FIX) {
    // best-effort sync trigger; tests should also run teardown explicitly
    teardown(FIX).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// A. work_permits
// ---------------------------------------------------------------------------

Deno.test("A1: tenant sees own permit, not another tenant's", async () => {
  const f = await getFix();
  const own = await f.tenantA.client.from("work_permits").select("id").eq("id", f.permitA.id);
  assertEquals(own.error, null);
  assertEquals(own.data?.length, 1, "tenantA must see own permit");

  const foreign = await f.tenantA.client.from("work_permits").select("id").eq("id", f.permitB.id);
  assertEquals(foreign.error, null);
  assertEquals(foreign.data?.length, 0, "tenantA must NOT see tenantB's permit");
});

Deno.test("A2: tenant cannot UPDATE non-draft permit", async () => {
  const f = await getFix();
  const res = await f.tenantA.client
    .from("work_permits")
    .update({ work_description: "tampered" })
    .eq("id", f.permitANonDraft.id)
    .select("id");
  // RLS makes the row invisible, so update returns no rows (no error, 0 rows).
  assertEquals(res.data?.length ?? 0, 0, "non-draft update must affect 0 rows");

  // Sanity: service-role should still see the original description.
  const { data: srv } = await f.admin
    .from("work_permits")
    .select("work_description")
    .eq("id", f.permitANonDraft.id)
    .single();
  assertNotEquals(srv?.work_description, "tampered");
});

Deno.test("A3: tenant cannot directly INSERT work_permits", async () => {
  const f = await getFix();
  const today = new Date().toISOString().slice(0, 10);
  const res = await f.tenantA.client.from("work_permits").insert({
    requester_id: f.tenantA.id,
    requester_name: "should fail",
    requester_email: f.tenantA.email,
    contractor_name: "evil",
    work_description: "should be blocked by RLS",
    work_date_from: today,
    work_date_to: today,
    work_time_from: "09:00",
    work_time_to: "17:00",
    urgency: "normal",
    status: "draft",
  });
  assertNotEquals(res.error, null, "direct tenant insert must be rejected");
});

Deno.test("A4: admin sees all permits", async () => {
  const f = await getFix();
  const ids = [f.permitA.id, f.permitB.id, f.permitANonDraft.id];
  const { data, error } = await f.adminUser.client
    .from("work_permits")
    .select("id")
    .in("id", ids);
  assertEquals(error, null);
  assertEquals(data?.length, 3, "admin must see every fixture permit");
});

// ---------------------------------------------------------------------------
// B. user_roles (privilege escalation)
// ---------------------------------------------------------------------------

Deno.test("B1: tenant cannot INSERT into user_roles", async () => {
  const f = await getFix();
  const { data: adminRole } = await f.admin.from("roles").select("id").eq("name", "admin").single();
  assert(adminRole);
  const res = await f.tenantA.client
    .from("user_roles")
    .insert({ user_id: f.tenantA.id, role_id: adminRole!.id });
  assertNotEquals(res.error, null, "tenant must NOT be able to grant themselves admin");
});

Deno.test("B2: tenant cannot UPDATE or DELETE user_roles", async () => {
  const f = await getFix();
  const upd = await f.tenantA.client.from("user_roles").update({ role_id: null }).eq("user_id", f.tenantA.id).select("user_id");
  assertEquals(upd.data?.length ?? 0, 0, "tenant update of user_roles must affect 0 rows");

  const del = await f.tenantA.client.from("user_roles").delete().eq("user_id", f.tenantA.id).select("user_id");
  assertEquals(del.data?.length ?? 0, 0, "tenant delete of user_roles must affect 0 rows");
});

Deno.test("B3: admin can manage user_roles", async () => {
  const f = await getFix();
  // Admin reads should see tenantA's row.
  const { data } = await f.adminUser.client.from("user_roles").select("user_id").eq("user_id", f.tenantA.id);
  assert((data?.length ?? 0) >= 1, "admin must see tenant role rows");
});

// ---------------------------------------------------------------------------
// C. profiles
// ---------------------------------------------------------------------------

Deno.test("C1: tenant sees only own profile", async () => {
  const f = await getFix();
  const own = await f.tenantA.client.from("profiles").select("id").eq("id", f.tenantA.id);
  assertEquals(own.data?.length, 1, "tenant must see own profile");
  const foreign = await f.tenantA.client.from("profiles").select("id").eq("id", f.tenantB.id);
  assertEquals(foreign.data?.length, 0, "tenant must NOT see another user's profile");
});

Deno.test("C2: admin sees all profiles", async () => {
  const f = await getFix();
  const { data } = await f.adminUser.client
    .from("profiles")
    .select("id")
    .in("id", [f.tenantA.id, f.tenantB.id, f.adminUser.id]);
  assertEquals(data?.length, 3);
});

// ---------------------------------------------------------------------------
// D. public_submission_log (service-role only)
// ---------------------------------------------------------------------------

Deno.test("D1: anon cannot SELECT or INSERT public_submission_log", async () => {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const sel = await anon.from("public_submission_log").select("ip").limit(1);
  // Either error or empty — both prove anon can't read.
  assert((sel.error !== null) || (sel.data?.length === 0), "anon must not read public_submission_log");

  const ins = await anon.from("public_submission_log").insert({ ip: "1.2.3.4" });
  assertNotEquals(ins.error, null, "anon must not insert public_submission_log");
});

Deno.test("D2: authenticated tenant cannot SELECT or INSERT public_submission_log", async () => {
  const f = await getFix();
  const sel = await f.tenantA.client.from("public_submission_log").select("ip").limit(1);
  assert((sel.error !== null) || (sel.data?.length === 0), "tenant must not read public_submission_log");

  const ins = await f.tenantA.client.from("public_submission_log").insert({ ip: "1.2.3.4" });
  assertNotEquals(ins.error, null, "tenant must not insert public_submission_log");
});

// ---------------------------------------------------------------------------
// E. Edge function auth
// ---------------------------------------------------------------------------

async function callFn(name: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

Deno.test("E1: generate-permit-pdf rejects requests with no Authorization header", async () => {
  const res = await callFn("generate-permit-pdf", { body: JSON.stringify({ permitId: "00000000-0000-0000-0000-000000000000" }) });
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("E2: generate-permit-pdf returns 403 for a user who isn't requester/approver/admin", async () => {
  const f = await getFix();
  const { data: { session } } = await f.tenantB.client.auth.getSession();
  assert(session?.access_token, "tenantB must have a token");
  const res = await callFn("generate-permit-pdf", {
    headers: { Authorization: `Bearer ${session!.access_token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ permitId: f.permitA.id }),
  });
  const body = await res.text();
  // Acceptable: 403 (explicit) or 404 (if function chooses to mask). Fail on 200/2xx.
  assert(
    res.status === 403 || res.status === 404,
    `expected 403/404 for cross-tenant generate-permit-pdf, got ${res.status}: ${body}`,
  );
});

Deno.test("E3: preview-permit-pdf rejects requests with no Authorization header (regression guard)", async () => {
  const res = await callFn("preview-permit-pdf", { body: JSON.stringify({ formData: {} }) });
  await res.text();
  assertEquals(res.status, 401);
});

// ---------------------------------------------------------------------------
// Z. Explicit teardown — last test runs cleanup.
// ---------------------------------------------------------------------------

Deno.test("ZZ: teardown fixtures", async () => {
  if (FIX) {
    await teardown(FIX);
    FIX = null;
  }
});
