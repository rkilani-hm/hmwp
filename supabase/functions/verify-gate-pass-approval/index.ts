// =============================================================================
// verify-gate-pass-approval
//
// Server-side verification + state transition for gate pass approvals.
// Mirrors verify-signature-approval but for the gate_passes table.
//
// Before this function existed, GatePassDetail did a client-side re-login to
// "verify" the password and then called the client-side useApproveGatePass
// hook that directly updated the gate_passes table. That flow:
//   1. Allowed a modified client to skip password verification entirely.
//   2. Permitted approvals by anyone who could satisfy RLS, with no audit log.
//   3. Accepted "__BIOMETRIC_VERIFIED__" magic-token for biometric.
//
// This function fixes all three by:
//   - Verifying password server-side in constant time, OR verifying a
//     WebAuthn assertion bound to the gate pass + role + action.
//   - Inserting a signature_audit_logs row with ip, device, auth method.
//   - Applying the approval and computing the next status server-side.
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { verifyAuthenticationResponse } from "https://esm.sh/@simplewebauthn/server@11.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Rate limiting + password check (same pattern as verify-signature-approval)
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string, ipAddress: string) {
  const key = `${userId}:${ipAddress}`;
  const now = Date.now();
  const rec = rateLimitStore.get(key);
  if (!rec || now > rec.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true as const };
  }
  if (rec.count >= MAX_ATTEMPTS_PER_WINDOW) {
    return { allowed: false as const, retryAfter: Math.ceil((rec.resetTime - now) / 1000) };
  }
  rec.count++;
  return { allowed: true as const };
}

async function constantTimePasswordCheck(
  supabaseUrl: string,
  supabaseAnonKey: string,
  email: string,
  password: string,
): Promise<boolean> {
  const MIN = 500;
  const start = Date.now();
  let ok = false;
  try {
    const c = createClient(supabaseUrl, supabaseAnonKey);
    const { error } = await c.auth.signInWithPassword({ email, password });
    ok = !error;
  } catch { ok = false; }
  const elapsed = Date.now() - start;
  if (elapsed < MIN) await new Promise((r) => setTimeout(r, MIN - elapsed));
  return ok;
}

// ---------------------------------------------------------------------------
// Request schema (discriminated auth)
// ---------------------------------------------------------------------------
const Schema = z.object({
  gatePassId: z.string().uuid(),
  role: z.string().min(1).max(100),
  comments: z.string().max(1000).optional().default("").transform((v) => (v ?? "").trim()),
  signature: z.string().max(100000).nullable().optional(),
  approved: z.boolean(),
  cctvConfirmed: z.boolean().optional(),

  authMethod: z.enum(["password", "webauthn"]),
  password: z.string().min(1).max(100).optional(),
  webauthn: z.object({
    challengeId: z.string().uuid(),
    assertion: z.record(z.unknown()),
  }).optional(),
}).superRefine((v, ctx) => {
  if (v.authMethod === "password" && !v.password) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "password required" });
  }
  if (v.authMethod === "webauthn" && !v.webauthn) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "webauthn.assertion required" });
  }
});

// ---------------------------------------------------------------------------
// WebAuthn helpers
// ---------------------------------------------------------------------------
function getRpConfig() {
  const rpID = Deno.env.get("WEBAUTHN_RP_ID");
  const originsRaw = Deno.env.get("WEBAUTHN_ORIGINS") || "";
  if (!rpID) throw new Error("WEBAUTHN_RP_ID not configured");
  const origins = originsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error("WEBAUTHN_ORIGINS not configured");
  return { rpID, origins };
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// deno-lint-ignore no-explicit-any
async function verifyWebAuthn(serviceClient: any, opts: {
  userId: string;
  challengeId: string;
  // deno-lint-ignore no-explicit-any
  assertion: any;
  requiredBinding: { gatePassId?: string; role?: string; action?: "approve" | "reject" };
}): Promise<{ credentialRowId: string } | { error: string }> {
  const { data: challengeRow } = await serviceClient
    .from("webauthn_challenges").select("*")
    .eq("id", opts.challengeId).eq("user_id", opts.userId)
    .eq("purpose", "approval").eq("consumed", false).maybeSingle();
  if (!challengeRow) return { error: "Challenge not found or already used" };
  if (new Date(challengeRow.expires_at).getTime() < Date.now()) return { error: "Challenge expired" };

  const binding = (challengeRow.binding as Record<string, unknown>) || {};
  for (const [k, v] of Object.entries(opts.requiredBinding)) {
    if (v === undefined) continue;
    if (binding[k] !== v) return { error: `Challenge binding mismatch on ${k}` };
  }

  const { error: consumeError, count } = await serviceClient
    .from("webauthn_challenges")
    .update({ consumed: true }, { count: "exact" })
    .eq("id", opts.challengeId).eq("consumed", false);
  if (consumeError || count === 0) return { error: "Challenge already consumed" };

  const credId = opts.assertion?.id;
  if (!credId || typeof credId !== "string") return { error: "Assertion missing credential id" };
  const { data: credential } = await serviceClient
    .from("webauthn_credentials").select("*")
    .eq("user_id", opts.userId).eq("credential_id", credId).maybeSingle();
  if (!credential) return { error: "Unknown credential. Please register this device." };

  const { rpID, origins } = getRpConfig();
  try {
    const verification = await verifyAuthenticationResponse({
      response: opts.assertion,
      expectedChallenge: challengeRow.challenge as string,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: credential.credential_id as string,
        publicKey: base64UrlToBytes(credential.public_key as string),
        counter: Number(credential.counter) || 0,
        transports: (credential.transports as AuthenticatorTransport[] | null) ?? undefined,
      },
    });
    if (!verification.verified) return { error: "Assertion verification failed" };

    const newCounter = verification.authenticationInfo.newCounter;
    const oldCounter = Number(credential.counter) || 0;
    if (oldCounter > 0 && newCounter > 0 && newCounter <= oldCounter) {
      return { error: "Authenticator replay detected. Please re-register this device." };
    }
    await serviceClient.from("webauthn_credentials")
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq("id", credential.id);

    return { credentialRowId: credential.id as string };
  } catch (err) {
    return { error: "Assertion verification error: " + (err instanceof Error ? err.message : "unknown") };
  }
}

// ---------------------------------------------------------------------------
// Gate pass next-status computation
//
// Priority order:
//   1. gate_pass_type_workflows mapping → walk workflow_steps
//   2. Legacy hardcoded flow (store_manager → [finance if high-value] → security)
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function computeNextStatus(serviceClient: any, gp: any, currentRole: string): Promise<string> {
  try {
    const { data: mapping } = await serviceClient
      .from("gate_pass_type_workflows")
      .select("workflow_template_id")
      .eq("pass_type", gp.pass_type)
      .maybeSingle();

    if (mapping?.workflow_template_id) {
      const { data: steps } = await serviceClient
        .from("workflow_steps")
        .select("step_order, role:roles(name)")
        .eq("workflow_template_id", mapping.workflow_template_id)
        .order("step_order");

      if (steps && steps.length > 0) {
        const currentIdx = steps.findIndex((s: { role?: { name?: string } }) =>
          s.role && typeof s.role === "object" && s.role.name === currentRole
        );
        if (currentIdx >= 0 && currentIdx < steps.length - 1) {
          const nextStep = steps[currentIdx + 1];
          if (nextStep.role?.name) return `pending_${nextStep.role.name}`;
        }
        if (currentIdx === steps.length - 1) return "approved";
      }
    }
  } catch {
    // fall through
  }

  // Legacy fallback
  if (currentRole === "store_manager") {
    return gp.has_high_value_asset ? "pending_finance" : "pending_security";
  }
  if (currentRole === "finance") return "pending_security";
  if (currentRole === "security") return "approved";
  return "approved";
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    const token = authHeader.replace("Bearer ", "");

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const raw = await req.json();
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return new Response(JSON.stringify({
        error: "Validation failed: " + parsed.error.errors.map((e) => e.message).join(", "),
      }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    const { gatePassId, role, comments, signature, approved, cctvConfirmed, authMethod, password, webauthn } = parsed.data;

    const ipAddress =
      req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") ||
      req.headers.get("cf-connecting-ip") || "unknown";

    const rl = checkRateLimit(user.id, ipAddress);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded", retryAfter: rl.retryAfter }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfter), ...corsHeaders } });
    }

    // Check user is a gate pass approver
    const { data: isGpApprover } = await adminClient.rpc("is_gate_pass_approver", { _user_id: user.id });
    if (!isGpApprover) {
      return new Response(JSON.stringify({ error: "You are not authorized to approve gate passes" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // Verify auth
    let webauthnCredentialRowId: string | null = null;
    if (authMethod === "password") {
      const ok = await constantTimePasswordCheck(supabaseUrl, supabaseAnonKey, user.email!, password!);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Invalid password" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    } else {
      const result = await verifyWebAuthn(adminClient, {
        userId: user.id,
        challengeId: webauthn!.challengeId,
        assertion: webauthn!.assertion,
        requiredBinding: { gatePassId, role, action: approved ? "approve" : "reject" },
      });
      if ("error" in result) {
        return new Response(JSON.stringify({ error: result.error }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      webauthnCredentialRowId = result.credentialRowId;
    }

    // Fetch current gate pass
    const { data: gp, error: fetchErr } = await adminClient
      .from("gate_passes").select("*").eq("id", gatePassId).single();
    if (fetchErr || !gp) {
      return new Response(JSON.stringify({ error: "Gate pass not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const { data: profile } = await adminClient
      .from("profiles").select("full_name").eq("id", user.id).single();
    const approverName = profile?.full_name || user.email || "Unknown";
    const now = new Date().toISOString();

    // Build update payload
    const updateData: Record<string, unknown> = {};
    const roleColumns = ["store_manager", "finance", "security", "security_pmd", "cr_coordinator", "head_cr", "hm_security_pmd"];

    if (!approved) {
      updateData.status = "rejected";
      if (roleColumns.includes(role)) {
        updateData[`${role}_name`] = approverName;
        updateData[`${role}_date`] = now;
        updateData[`${role}_comments`] = comments || null;
      }
    } else {
      if (roleColumns.includes(role)) {
        updateData[`${role}_name`] = approverName;
        updateData[`${role}_date`] = now;
        updateData[`${role}_comments`] = comments || null;
        updateData[`${role}_signature`] = signature || null;
        if (role === "security") updateData.security_cctv_confirmed = !!cctvConfirmed;
        if (role === "security_pmd" || role === "hm_security_pmd") {
          updateData[`${role}_material_action`] = gp.pass_type === "material_in" ? "received" : "released";
        }
      }
      updateData.status = await computeNextStatus(adminClient, gp, role);
    }

    const { data: updated, error: updErr } = await adminClient
      .from("gate_passes").update(updateData).eq("id", gatePassId).select().single();
    if (updErr) {
      console.error("Gate pass update error:", updErr);
      return new Response(JSON.stringify({ error: "Failed to update gate pass" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // Audit log
    let signatureHash: string | null = null;
    if (signature) {
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signature));
      signatureHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    const userAgent = req.headers.get("user-agent") || "unknown";
    const deviceInfo = {
      platform: userAgent.includes("iPhone") || userAgent.includes("iPad") ? "iOS"
        : userAgent.includes("Android") ? "Android"
        : userAgent.includes("Mac") ? "macOS"
        : userAgent.includes("Windows") ? "Windows" : "Unknown",
      browser: userAgent.includes("Edge") ? "Edge"
        : userAgent.includes("Chrome") ? "Chrome"
        : userAgent.includes("Firefox") ? "Firefox"
        : userAgent.includes("Safari") ? "Safari" : "Unknown",
      timestamp: now,
      authMethod,
    };

    await adminClient.from("signature_audit_logs").insert({
      gate_pass_id: gatePassId,
      user_id: user.id,
      user_email: user.email!,
      user_name: approverName,
      role,
      action: approved ? "approved" : "rejected",
      ip_address: ipAddress,
      user_agent: userAgent,
      device_info: deviceInfo,
      signature_hash: signatureHash,
      password_verified: authMethod === "password",
      auth_method: authMethod,
      webauthn_credential_id: webauthnCredentialRowId,
    });

    // Fire downstream notifications (best-effort)
    try {
      if (updated.requester_email) {
        await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [updated.requester_email],
            subject: `Gate Pass ${updated.pass_no} — ${approved ? "Update" : "Rejected"}`,
            notificationType: approved
              ? (updated.status === "approved" ? "approved" : "status_update")
              : "rejected",
            permitNo: updated.pass_no,
            permitId: gatePassId,
            details: { approverName, reason: comments },
          }),
        });
      }
    } catch (e) {
      console.error("Gate pass email error (non-blocking):", e);
    }

    return new Response(JSON.stringify({
      success: true,
      gatePass: updated,
      auditInfo: { ipAddress, deviceInfo, timestamp: now },
    }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (err) {
    console.error("verify-gate-pass-approval error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
