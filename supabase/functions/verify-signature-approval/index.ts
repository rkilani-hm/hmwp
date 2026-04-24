// =============================================================================
// verify-signature-approval (PATCHED for Phase 1 WebAuthn)
//
// Changes from previous version:
//   - Removes the "__BIOMETRIC_VERIFIED__" magic-token path (INSECURE).
//   - Adds proper WebAuthn assertion verification against stored credentials,
//     with per-action challenge binding (prevents replay across permits/actions).
//   - Records auth_method + webauthn_credential_id in signature_audit_logs.
//
// All downstream logic (workflow next-step, notifications, PDF regen) is
// unchanged from the original.
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { verifyAuthenticationResponse } from "https://esm.sh/@simplewebauthn/server@11.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { mirrorPermitApproval } from "../_shared/approvals-dualwrite.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, per-edge-instance)
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

// ---------------------------------------------------------------------------
// Password verification (timing-safe, unchanged)
// ---------------------------------------------------------------------------
async function constantTimePasswordCheck(
  supabaseUrl: string,
  supabaseAnonKey: string,
  email: string,
  password: string,
): Promise<boolean> {
  const MIN_RESPONSE_TIME = 500;
  const startTime = Date.now();
  let isValid = false;
  try {
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const { error } = await client.auth.signInWithPassword({ email, password });
    isValid = !error;
  } catch {
    isValid = false;
  }
  const elapsed = Date.now() - startTime;
  if (elapsed < MIN_RESPONSE_TIME) {
    await new Promise((r) => setTimeout(r, MIN_RESPONSE_TIME - elapsed));
  }
  return isValid;
}

// ---------------------------------------------------------------------------
// Input schema — now supports either password OR webauthn assertion
// ---------------------------------------------------------------------------
const ApprovalSchema = z.object({
  permitId: z.string().uuid("Invalid permit ID format"),
  role: z.string().min(1, "Role is required"),
  comments: z.string().max(1000, "Comments must be less than 1000 characters").transform((v) => v.trim()),
  signature: z.string().max(100000, "Signature data too large").nullable(),
  approved: z.boolean({ required_error: "Approved status is required" }),

  // Exactly one of the following auth paths must be provided:
  authMethod: z.enum(["password", "webauthn"]),
  password: z.string().min(1).max(100).optional(),
  webauthn: z.object({
    challengeId: z.string().uuid(),
    assertion: z.record(z.unknown()),
  }).optional(),
}).superRefine((val, ctx) => {
  if (val.authMethod === "password" && !val.password) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "password is required when authMethod=password" });
  }
  if (val.authMethod === "webauthn" && !val.webauthn) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "webauthn.assertion is required when authMethod=webauthn" });
  }
});

// ---------------------------------------------------------------------------
// WebAuthn config + shared helpers inlined (to keep this function self-contained)
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

// ---------------------------------------------------------------------------
// Verify a WebAuthn assertion against stored credential + bound challenge.
// Returns the credential row if valid, null otherwise.
// ---------------------------------------------------------------------------
async function verifyWebAuthnAssertion(opts: {
  // deno-lint-ignore no-explicit-any
  serviceClient: any;
  userId: string;
  challengeId: string;
  // deno-lint-ignore no-explicit-any
  assertion: any;
  requiredBinding: { permitId?: string; role?: string; action?: "approve" | "reject" };
}): Promise<{ credentialRowId: string } | { error: string }> {
  const { serviceClient, userId, challengeId, assertion, requiredBinding } = opts;

  // 1. Load and validate challenge (one-shot, bound to action)
  const { data: challengeRow, error: challengeError } = await serviceClient
    .from("webauthn_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .eq("purpose", "approval")
    .eq("consumed", false)
    .maybeSingle();

  if (challengeError || !challengeRow) {
    return { error: "Challenge not found or already used" };
  }
  if (new Date(challengeRow.expires_at).getTime() < Date.now()) {
    return { error: "Challenge expired. Please retry." };
  }

  // Binding check: every requiredBinding field must match
  const binding = (challengeRow.binding as Record<string, unknown>) || {};
  for (const [k, v] of Object.entries(requiredBinding)) {
    if (v === undefined) continue;
    if (binding[k] !== v) {
      return { error: `Challenge binding mismatch on ${k}` };
    }
  }

  // 2. Consume challenge atomically (prevents parallel reuse)
  const { error: consumeError, count } = await serviceClient
    .from("webauthn_challenges")
    .update({ consumed: true }, { count: "exact" })
    .eq("id", challengeId)
    .eq("consumed", false);

  if (consumeError || count === 0) {
    return { error: "Challenge already consumed (concurrent use detected)" };
  }

  // 3. Look up stored credential by id
  const credIdFromAssertion = assertion?.id;
  if (!credIdFromAssertion || typeof credIdFromAssertion !== "string") {
    return { error: "Assertion missing credential id" };
  }

  const { data: credential, error: credError } = await serviceClient
    .from("webauthn_credentials")
    .select("*")
    .eq("user_id", userId)
    .eq("credential_id", credIdFromAssertion)
    .maybeSingle();

  if (credError || !credential) {
    return { error: "Unknown credential. Please register this device." };
  }

  // 4. Verify the assertion signature
  const { rpID, origins } = getRpConfig();

  try {
    const verification = await verifyAuthenticationResponse({
      response: assertion,
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

    if (!verification.verified) {
      return { error: "Assertion signature verification failed" };
    }

    // 5. Update counter + last_used_at (detect cloned authenticators)
    const newCounter = verification.authenticationInfo.newCounter;
    const oldCounter = Number(credential.counter) || 0;
    // Many platform authenticators (especially TouchID/FaceID) always return 0
    // for the counter. Only enforce monotonic-increase check when both sides > 0.
    if (oldCounter > 0 && newCounter > 0 && newCounter <= oldCounter) {
      console.error(`Counter regression for credential ${credential.id}: ${oldCounter} -> ${newCounter}`);
      return { error: "Authenticator replay detected. Please re-register this device." };
    }

    await serviceClient
      .from("webauthn_credentials")
      .update({
        counter: newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", credential.id);

    return { credentialRowId: credential.id as string };
  } catch (err) {
    console.error("WebAuthn verification threw:", err);
    return { error: "Assertion verification error: " + (err instanceof Error ? err.message : "unknown") };
  }
}

// =============================================================================
// Workflow step logic (UNCHANGED from original)
// =============================================================================

interface WorkflowStep {
  id: string;
  step_order: number;
  role_id: string;
  step_name: string | null;
  is_required_default: boolean;
  can_be_skipped: boolean;
  role: { id: string; name: string; label: string };
}

interface WorkType {
  id: string;
  name: string;
  workflow_template_id: string | null;
  requires_pm?: boolean;
  requires_pd?: boolean;
  requires_bdcr?: boolean;
  requires_mpr?: boolean;
  requires_it?: boolean;
  requires_fitout?: boolean;
  requires_ecovert_supervisor?: boolean;
  requires_pmd_coordinator?: boolean;
}

interface WorkLocation {
  id: string;
  name: string;
  location_type: "shop" | "common";
}

// deno-lint-ignore no-explicit-any
async function getWorkflowSteps(serviceClient: any, workType: WorkType | null, permitId?: string) {
  if (!workType?.workflow_template_id) {
    return { steps: [] as WorkflowStep[], stepConfigs: new Map<string, boolean>(), permitOverrides: new Map<string, boolean>() };
  }
  const { data: steps } = await serviceClient
    .from("workflow_steps")
    .select(`id, step_order, role_id, step_name, is_required_default, can_be_skipped,
             role:roles!workflow_steps_role_id_fkey (id, name, label)`)
    .eq("workflow_template_id", workType.workflow_template_id)
    .order("step_order", { ascending: true });

  const { data: configs } = await serviceClient
    .from("work_type_step_config")
    .select("workflow_step_id, is_required")
    .eq("work_type_id", workType.id);

  const stepConfigs = new Map<string, boolean>();
  for (const c of configs ?? []) stepConfigs.set(c.workflow_step_id, c.is_required);

  const permitOverrides = new Map<string, boolean>();
  if (permitId) {
    const { data: overrides } = await serviceClient
      .from("permit_workflow_overrides")
      .select("workflow_step_id, is_required")
      .eq("permit_id", permitId);
    for (const o of overrides ?? []) permitOverrides.set(o.workflow_step_id, o.is_required);
  }
  return { steps: (steps ?? []) as WorkflowStep[], stepConfigs, permitOverrides };
}

function isStepRequired(
  step: WorkflowStep,
  stepConfigs: Map<string, boolean>,
  permitOverrides: Map<string, boolean>,
  workType: WorkType | null,
  locationType: "shop" | "common" | null,
): boolean {
  if (permitOverrides.has(step.id)) return permitOverrides.get(step.id)!;
  if (stepConfigs.has(step.id)) return stepConfigs.get(step.id)!;
  if (step.is_required_default !== null && step.is_required_default !== undefined) return step.is_required_default;
  const roleName = step.role?.name;
  if (workType && roleName) {
    const legacyField = `requires_${roleName}` as keyof WorkType;
    if (legacyField in workType && typeof workType[legacyField] === "boolean") {
      return workType[legacyField] as boolean;
    }
  }
  if (roleName === "pm" && locationType === "shop") return true;
  if (roleName === "pd" && locationType === "common") return true;
  return true;
}

// deno-lint-ignore no-explicit-any
async function getNextApprovalStep(
  serviceClient: any, currentRole: string, workType: WorkType | null,
  locationType: "shop" | "common" | null, permitId?: string,
): Promise<{ nextStatus: string; nextRole: string | null }> {
  const { steps, stepConfigs, permitOverrides } = await getWorkflowSteps(serviceClient, workType, permitId);
  if (steps.length === 0) return getLegacyNextApprovalStep(currentRole, workType, locationType);
  const currentIndex = steps.findIndex((s) => s.role?.name === currentRole);
  if (currentIndex === -1) return { nextStatus: "approved", nextRole: null };
  for (let i = currentIndex + 1; i < steps.length; i++) {
    const step = steps[i];
    if (!step.role?.name) continue;
    if (isStepRequired(step, stepConfigs, permitOverrides, workType, locationType)) {
      return { nextStatus: `pending_${step.role.name}`, nextRole: step.role.name };
    }
  }
  return { nextStatus: "approved", nextRole: null };
}

const LEGACY_APPROVAL_ORDER = [
  { role: "helpdesk", status: "submitted", nextStatus: "pending_pm", requiresField: null },
  { role: "customer_service", status: "pending_customer_service", nextStatus: "pending_cr_coordinator", requiresField: null },
  { role: "cr_coordinator", status: "pending_cr_coordinator", nextStatus: "pending_head_cr", requiresField: null },
  { role: "head_cr", status: "pending_head_cr", nextStatus: "pending_pm", requiresField: null },
  { role: "pm", status: "pending_pm", nextStatus: "pending_pd", requiresField: "requires_pm", locationType: "shop" },
  { role: "pd", status: "pending_pd", nextStatus: "pending_bdcr", requiresField: "requires_pd", locationType: "common" },
  { role: "bdcr", status: "pending_bdcr", nextStatus: "pending_mpr", requiresField: "requires_bdcr" },
  { role: "mpr", status: "pending_mpr", nextStatus: "pending_it", requiresField: "requires_mpr" },
  { role: "it", status: "pending_it", nextStatus: "pending_fitout", requiresField: "requires_it" },
  { role: "fitout", status: "pending_fitout", nextStatus: "pending_ecovert_supervisor", requiresField: "requires_fitout" },
  { role: "ecovert_supervisor", status: "pending_ecovert_supervisor", nextStatus: "pending_pmd_coordinator", requiresField: "requires_ecovert_supervisor" },
  { role: "pmd_coordinator", status: "pending_pmd_coordinator", nextStatus: "approved", requiresField: "requires_pmd_coordinator" },
];

function getLegacyNextApprovalStep(
  currentRole: string, workType: WorkType | null, locationType: "shop" | "common" | null,
): { nextStatus: string; nextRole: string | null } {
  const currentIndex = LEGACY_APPROVAL_ORDER.findIndex((s) => s.role === currentRole);
  if (currentIndex === -1) return { nextStatus: "approved", nextRole: null };
  if (currentRole === "helpdesk") {
    const t = locationType || "shop";
    return t === "shop"
      ? { nextStatus: "pending_pm", nextRole: "pm" }
      : { nextStatus: "pending_pd", nextRole: "pd" };
  }
  for (let i = currentIndex + 1; i < LEGACY_APPROVAL_ORDER.length; i++) {
    const step = LEGACY_APPROVAL_ORDER[i];
    if (step.locationType) {
      if (currentRole === "pm" && step.role === "pd" && !workType?.requires_pd) continue;
      if (currentRole === "pd" && step.role === "pm") continue;
    }
    if (!step.requiresField || !workType) return { nextStatus: step.status, nextRole: step.role };
    if (workType[step.requiresField as keyof WorkType]) {
      return { nextStatus: step.status, nextRole: step.role };
    }
  }
  return { nextStatus: "approved", nextRole: null };
}

// =============================================================================
// Main handler
// =============================================================================

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const rawBody = await req.json();
    const parseResult = ApprovalSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map((e) => e.message).join(", ");
      return new Response(JSON.stringify({ error: `Validation failed: ${errorMessages}` }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const { permitId, role, comments, signature, approved, authMethod, password, webauthn } = parseResult.data;

    const ipAddress =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    // Rate limit
    const rl = checkRateLimit(user.id, ipAddress);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many verification attempts. Please try again later.", retryAfter: rl.retryAfter }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfter), ...corsHeaders } },
      );
    }

    // -----------------------------------------------------------------------
    // Verification: password OR webauthn assertion
    // -----------------------------------------------------------------------
    let webauthnCredentialRowId: string | null = null;

    if (authMethod === "password") {
      const isVerified = await constantTimePasswordCheck(supabaseUrl, supabaseAnonKey, user.email!, password!);
      if (!isVerified) {
        return new Response(
          JSON.stringify({ error: "Invalid password. Please enter your correct password to confirm approval." }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }
    } else {
      // authMethod === 'webauthn'
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
      const result = await verifyWebAuthnAssertion({
        serviceClient,
        userId: user.id,
        challengeId: webauthn!.challengeId,
        assertion: webauthn!.assertion,
        requiredBinding: {
          permitId,
          role,
          action: approved ? "approve" : "reject",
        },
      });
      if ("error" in result) {
        console.error("WebAuthn verification failed for user:", user.email, "reason:", result.error);
        return new Response(JSON.stringify({ error: result.error }), {
          status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      webauthnCredentialRowId = result.credentialRowId;
    }

    console.log(`Identity verified for ${user.email} via ${authMethod}`);
    const userAgent = req.headers.get("user-agent") || "unknown";

    const deviceInfo = {
      platform: userAgent.includes("Windows") ? "Windows"
        : userAgent.includes("Mac") ? "macOS"
        : userAgent.includes("Linux") ? "Linux"
        : userAgent.includes("Android") ? "Android"
        : (userAgent.includes("iPhone") || userAgent.includes("iPad")) ? "iOS"
        : "Unknown",
      browser: userAgent.includes("Edge") ? "Edge"
        : userAgent.includes("Chrome") ? "Chrome"
        : userAgent.includes("Firefox") ? "Firefox"
        : userAgent.includes("Safari") ? "Safari"
        : "Unknown",
      timestamp: new Date().toISOString(),
      authMethod,
    };

    // Signature hash for audit
    let signatureHash: string | null = null;
    if (signature) {
      const data = new TextEncoder().encode(signature);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      signatureHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile } = await serviceClient
      .from("profiles").select("full_name").eq("id", user.id).single();
    const userName = profile?.full_name || user.email || "Unknown";

    const { error: auditError } = await serviceClient
      .from("signature_audit_logs")
      .insert({
        permit_id: permitId,
        user_id: user.id,
        user_email: user.email!,
        user_name: userName,
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
    if (auditError) console.error("Audit log error:", auditError);

    // ---- Everything below is the ORIGINAL downstream logic, unchanged ----
    const { data: currentPermit } = await serviceClient
      .from("work_permits")
      .select(`*, work_types (id, name, workflow_template_id, requires_pm, requires_pd,
               requires_bdcr, requires_mpr, requires_it, requires_fitout,
               requires_ecovert_supervisor, requires_pmd_coordinator),
               work_locations (id, name, location_type)`)
      .eq("id", permitId).single();

    if (!currentPermit) {
      return new Response(JSON.stringify({ error: "Permit not found" }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const workLocation = currentPermit?.work_locations as WorkLocation | null;
    const locationType = workLocation?.location_type || (currentPermit.work_location_other ? "shop" : null);

    const roleField = role.toLowerCase().replace(/ /g, "_");
    const approvalStatus = approved ? "approved" : "rejected";

    const rolesWithColumns = [
      "helpdesk", "pm", "pd", "bdcr", "mpr", "it", "fitout",
      "ecovert_supervisor", "pmd_coordinator",
      "customer_service", "cr_coordinator", "head_cr",
      "fmsp_approval",
    ];

    const updateData: Record<string, unknown> = {};
    if (rolesWithColumns.includes(roleField)) {
      updateData[`${roleField}_status`] = approvalStatus;
      updateData[`${roleField}_approver_name`] = userName;
      updateData[`${roleField}_approver_email`] = user.email;
      updateData[`${roleField}_date`] = new Date().toISOString();
      updateData[`${roleField}_comments`] = comments;
      updateData[`${roleField}_signature`] = signature;
    }

    if (!approved) {
      updateData.status = "rejected";
    } else {
      const workType = currentPermit?.work_types as WorkType | null;
      const { nextStatus } = await getNextApprovalStep(serviceClient, roleField, workType, locationType, permitId);
      updateData.status = nextStatus;
    }

    const { data: updatedPermit, error: updateError } = await serviceClient
      .from("work_permits").update(updateData).eq("id", permitId).select().single();
    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to update permit" }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ---- Phase 2b dual-write: mirror into permit_approvals ----
    // Legacy columns above are still the source of truth. This write is
    // non-blocking — failures are logged and do not affect the approval.
    await mirrorPermitApproval(serviceClient, {
      permitId,
      roleName: roleField,
      status: approvalStatus as "approved" | "rejected",
      approverUserId: user.id,
      approverName: userName,
      approverEmail: user.email!,
      approvedAt: new Date().toISOString(),
      comments: comments || null,
      signature: signature || null,
      signatureHash,
      authMethod,
      webauthnCredentialId: webauthnCredentialRowId,
      ipAddress,
      userAgent,
      deviceInfo,
    });

    await serviceClient.from("activity_logs").insert({
      permit_id: permitId,
      action: approved ? `${role} Approved` : `${role} Rejected`,
      performed_by: userName,
      performed_by_id: user.id,
      details: comments || `${approved ? "Approved" : "Rejected"} with verified signature (${authMethod})`,
    });

    if (updatedPermit.requester_id) {
      await serviceClient.from("notifications").insert({
        user_id: updatedPermit.requester_id,
        permit_id: permitId,
        type: approved ? "permit_approved" : "permit_rejected",
        title: `Permit ${approved ? "Approved" : "Rejected"} by ${role.toUpperCase()}`,
        message: `Your permit ${updatedPermit.permit_no} has been ${approved ? "approved" : "rejected"} by ${userName}. ${comments ? `Comments: ${comments}` : ""}`,
      });
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: updatedPermit.requester_id,
            title: `Permit ${approved ? "Approved" : "Rejected"}`,
            message: `${updatedPermit.permit_no} has been ${approved ? "approved" : "rejected"} by ${role.toUpperCase()}`,
            data: { url: `/permits/${permitId}`, permitId },
          }),
        });
      } catch (e) { console.error("Push error:", e); }
    }

    if (updatedPermit.requester_email) {
      try {
        let emailNotificationType: string;
        let emailSubject: string;
        let statusMessage = "";
        if (!approved) {
          emailNotificationType = "rejected";
          emailSubject = `Work Permit Rejected: ${updatedPermit.permit_no}`;
        } else if (updatedPermit.status === "approved") {
          emailNotificationType = "approved";
          emailSubject = `Work Permit Approved: ${updatedPermit.permit_no}`;
        } else {
          emailNotificationType = "status_update";
          const roleLabel = role.toUpperCase().replace("_", " ");
          statusMessage = `It has been approved by ${roleLabel} and is now pending the next approval.`;
          emailSubject = `Work Permit Progress Update: ${updatedPermit.permit_no}`;
        }
        await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [updatedPermit.requester_email],
            notificationType: emailNotificationType,
            subject: emailSubject,
            permitNo: updatedPermit.permit_no,
            permitId,
            details: {
              permitId,
              workType: currentPermit?.work_types?.name,
              approverName: userName,
              reason: comments,
              statusMessage,
            },
          }),
        });
      } catch (e) { console.error("Email error:", e); }
    }

    if (approved && updatedPermit.status !== "approved") {
      const nextRole = updatedPermit.status?.startsWith("pending_")
        ? updatedPermit.status.replace("pending_", "") : null;
      if (nextRole) {
        const { data: roleRow } = await serviceClient.from("roles").select("id").eq("name", nextRole).single();
        if (roleRow?.id) {
          const { data: nextApprovers } = await serviceClient
            .from("user_roles").select("user_id").eq("role_id", roleRow.id);
          const approverIds: string[] = (nextApprovers || []).map((a: { user_id: string }) => a.user_id).filter(Boolean);
          if (approverIds.length > 0) {
            const roleLabel = nextRole.toUpperCase().replace(/_/g, " ");
            for (const approverId of approverIds) {
              await serviceClient.from("notifications").insert({
                user_id: approverId,
                permit_id: permitId,
                type: "approval_needed",
                title: "Permit Pending Your Approval",
                message: `Permit ${updatedPermit.permit_no} requires your review as ${roleLabel}.`,
              });
            }
            try {
              await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  userIds: approverIds,
                  title: "Permit Awaiting Your Approval",
                  message: `${updatedPermit.permit_no} requires your review as ${roleLabel}`,
                  data: { url: `/inbox`, permitId },
                }),
              });
            } catch (e) { console.error("Push error:", e); }

            try {
              const { data: approverProfiles } = await serviceClient
                .from("profiles").select("email").in("id", approverIds);
              const approverEmails = approverProfiles?.map((p: { email: string }) => p.email).filter(Boolean) || [];
              if (approverEmails.length > 0) {
                await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    to: approverEmails,
                    notificationType: "approval_required",
                    subject: `Work Permit Awaiting Approval: ${updatedPermit.permit_no}`,
                    permitNo: updatedPermit.permit_no,
                    permitId,
                    details: {
                      permitId,
                      workType: currentPermit?.work_types?.name,
                      requesterName: updatedPermit.requester_name,
                      urgency: updatedPermit.urgency,
                    },
                  }),
                });
              }
            } catch (e) { console.error("Email error:", e); }
          }
        }
      }
    }

    if (approved) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/generate-permit-pdf`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ permitId }),
        });
      } catch (e) { console.error("PDF regen error (non-blocking):", e); }
    }

    return new Response(
      JSON.stringify({
        success: true,
        permit: updatedPermit,
        auditInfo: { ipAddress, deviceInfo, timestamp: new Date().toISOString() },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    console.error("Error processing approval:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
