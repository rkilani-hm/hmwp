// =============================================================================
// modify-permit-workflow (PATCHED for Phase 1b WebAuthn)
//
// Changes: removes BIOMETRIC_TOKEN magic-string path, adds real WebAuthn
// assertion verification bound to purpose='workflow_modify'.
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
// Input schema — accepts password OR webauthn
// ---------------------------------------------------------------------------
const ModifyWorkflowSchema = z.object({
  permitId: z.string().uuid(),
  modificationType: z.enum(["work_type_change", "custom_flow"]),
  newWorkTypeId: z.string().uuid().optional(),
  customSteps: z.array(z.object({
    stepId: z.string().uuid(),
    isRequired: z.boolean(),
  })).optional(),
  reason: z.string().min(1).max(1000),
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
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "webauthn required" });
  }
});

async function constantTimePasswordCheck(
  supabaseUrl: string, supabaseAnonKey: string, email: string, password: string,
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
async function verifyWebAuthnForWorkflow(serviceClient: any, opts: {
  userId: string;
  challengeId: string;
  // deno-lint-ignore no-explicit-any
  assertion: any;
  permitId: string;
}): Promise<{ credentialRowId: string } | { error: string }> {
  const { data: challengeRow } = await serviceClient
    .from("webauthn_challenges").select("*")
    .eq("id", opts.challengeId).eq("user_id", opts.userId)
    .eq("purpose", "workflow_modify").eq("consumed", false).maybeSingle();
  if (!challengeRow) return { error: "Challenge not found or already used" };
  if (new Date(challengeRow.expires_at).getTime() < Date.now()) return { error: "Challenge expired" };

  const binding = (challengeRow.binding as Record<string, unknown>) || {};
  if (binding.permitId !== opts.permitId) {
    return { error: "Challenge binding mismatch on permitId" };
  }

  const { error: consumeError, count } = await serviceClient
    .from("webauthn_challenges")
    .update({ consumed: true }, { count: "exact" })
    .eq("id", opts.challengeId).eq("consumed", false);
  if (consumeError || count === 0) return { error: "Challenge already consumed" };

  const credId = opts.assertion?.id;
  if (!credId) return { error: "Assertion missing credential id" };
  const { data: credential } = await serviceClient
    .from("webauthn_credentials").select("*")
    .eq("user_id", opts.userId).eq("credential_id", credId).maybeSingle();
  if (!credential) return { error: "Unknown credential" };

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
      return { error: "Authenticator replay detected" };
    }
    await serviceClient.from("webauthn_credentials")
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq("id", credential.id);
    return { credentialRowId: credential.id as string };
  } catch (err) {
    return { error: "Assertion verification error: " + (err instanceof Error ? err.message : "unknown") };
  }
}

const handler = async (req: Request): Promise<Response> => {
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
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const rawBody = await req.json();
    const parseResult = ModifyWorkflowSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return new Response(JSON.stringify({
        error: "Validation failed: " + parseResult.error.errors.map((e) => e.message).join(", "),
      }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    const { permitId, modificationType, newWorkTypeId, customSteps, reason, authMethod, password, webauthn } = parseResult.data;

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") ||
                      req.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Verify auth — password or webauthn (NO magic tokens)
    if (authMethod === "password") {
      const isVerified = await constantTimePasswordCheck(supabaseUrl, supabaseAnonKey, user.email!, password!);
      if (!isVerified) {
        return new Response(JSON.stringify({ error: "Invalid password" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    } else {
      const result = await verifyWebAuthnForWorkflow(adminClient, {
        userId: user.id,
        challengeId: webauthn!.challengeId,
        assertion: webauthn!.assertion,
        permitId,
      });
      if ("error" in result) {
        return new Response(JSON.stringify({ error: result.error }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    // --- Original downstream logic (unchanged from this point) ---
    const { data: profile } = await adminClient
      .from("profiles").select("full_name, email").eq("id", user.id).single();
    const userName = profile?.full_name || user.email || "Unknown";
    const userEmail = profile?.email || user.email || "unknown";

    const { data: permit, error: permitError } = await adminClient
      .from("work_permits")
      .select(`id, status, work_type_id,
        work_types (id, name, workflow_template_id)`)
      .eq("id", permitId).single();

    if (permitError || !permit) {
      return new Response(JSON.stringify({ error: "Permit not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const { data: isApprover } = await adminClient.rpc("is_approver", { _user_id: user.id });
    if (!isApprover) {
      return new Response(JSON.stringify({ error: "Only approvers can modify workflows" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const { data: userRoles } = await adminClient
      .from("user_roles").select("role_id").eq("user_id", user.id);
    if (!userRoles?.length) {
      return new Response(JSON.stringify({ error: "User has no roles assigned" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    const roleIds = userRoles.map((r: { role_id: string }) => r.role_id);
    const { data: hasPermission } = await adminClient
      .from("role_permissions")
      .select("id, permissions!inner(name)")
      .in("role_id", roleIds).eq("permissions.name", "modify_workflow").limit(1);
    if (!hasPermission?.length) {
      return new Response(JSON.stringify({ error: "You don't have permission to modify workflows." }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (!permit.status.startsWith("pending_") && !["submitted", "under_review"].includes(permit.status)) {
      return new Response(JSON.stringify({ error: "Can only modify workflow for permits pending approval" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // deno-lint-ignore no-explicit-any
    const workType = permit.work_types as any;
    // deno-lint-ignore no-explicit-any
    let originalSteps: any[] = [];
    if (workType?.workflow_template_id) {
      const { data: steps } = await adminClient.from("workflow_steps")
        .select(`id, step_order, role_id, step_name, is_required_default, role:roles(name, label)`)
        .eq("workflow_template_id", workType.workflow_template_id).order("step_order");
      originalSteps = steps || [];
    }

    const { data: currentOverrides } = await adminClient
      .from("permit_workflow_overrides").select("*").eq("permit_id", permitId);

    const originalStepsWithOverrides = originalSteps.map((step) => {
      // deno-lint-ignore no-explicit-any
      const override = currentOverrides?.find((o: any) => o.workflow_step_id === step.id);
      // deno-lint-ignore no-explicit-any
      const role = step.role as any;
      return {
        id: step.id, role: role?.name, roleLabel: role?.label,
        isRequired: override ? override.is_required : step.is_required_default,
      };
    });

    // deno-lint-ignore no-explicit-any
    let newStepsSnapshot: any[] = [];

    if (modificationType === "work_type_change" && newWorkTypeId) {
      const { data: newWorkType } = await adminClient.from("work_types")
        .select(`id, name, workflow_template_id`).eq("id", newWorkTypeId).single();
      if (!newWorkType) {
        return new Response(JSON.stringify({ error: "New work type not found" }),
          { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      if (!newWorkType.workflow_template_id) {
        return new Response(JSON.stringify({ error: "New work type has no workflow configured" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }

      const { data: newSteps } = await adminClient.from("workflow_steps")
        .select(`id, step_order, role_id, step_name, is_required_default, role:roles(name, label)`)
        .eq("workflow_template_id", newWorkType.workflow_template_id).order("step_order");
      const { data: newStepConfig } = await adminClient.from("work_type_step_config")
        .select("*").eq("work_type_id", newWorkTypeId);
      const configMap = new Map(
        newStepConfig?.map((c: { workflow_step_id: string; is_required: boolean }) =>
          [c.workflow_step_id, c.is_required]) || [],
      );
      newStepsSnapshot = (newSteps || []).map((step) => {
        // deno-lint-ignore no-explicit-any
        const role = step.role as any;
        return {
          id: step.id, role: role?.name, roleLabel: role?.label,
          isRequired: configMap.has(step.id) ? configMap.get(step.id) : step.is_required_default,
        };
      });
      await adminClient.from("permit_workflow_overrides").delete().eq("permit_id", permitId);
      const { error: updateError } = await adminClient.from("work_permits").update({
        work_type_id: newWorkTypeId,
        workflow_customized: true,
        workflow_modified_by: user.id,
        workflow_modified_at: new Date().toISOString(),
      }).eq("id", permitId);
      if (updateError) {
        return new Response(JSON.stringify({ error: "Failed to update permit" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    } else if (modificationType === "custom_flow" && customSteps) {
      await adminClient.from("permit_workflow_overrides").delete().eq("permit_id", permitId);
      const overridesToInsert = customSteps.map((step) => ({
        permit_id: permitId, workflow_step_id: step.stepId,
        is_required: step.isRequired, created_by: user.id,
      }));
      if (overridesToInsert.length > 0) {
        const { error: insertError } = await adminClient
          .from("permit_workflow_overrides").insert(overridesToInsert);
        if (insertError) {
          return new Response(JSON.stringify({ error: "Failed to save workflow overrides" }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }
      const customMap = new Map(customSteps.map((s) => [s.stepId, s.isRequired]));
      newStepsSnapshot = originalSteps.map((step) => {
        // deno-lint-ignore no-explicit-any
        const role = step.role as any;
        return {
          id: step.id, role: role?.name, roleLabel: role?.label,
          isRequired: customMap.has(step.id) ? customMap.get(step.id) : step.is_required_default,
        };
      });
      await adminClient.from("work_permits").update({
        workflow_customized: true,
        workflow_modified_by: user.id,
        workflow_modified_at: new Date().toISOString(),
      }).eq("id", permitId);
    }

    await adminClient.from("permit_workflow_audit").insert({
      permit_id: permitId,
      modified_by: user.id, modified_by_name: userName, modified_by_email: userEmail,
      modification_type: modificationType,
      original_work_type_id: permit.work_type_id,
      new_work_type_id: modificationType === "work_type_change" ? newWorkTypeId : null,
      original_steps: originalStepsWithOverrides,
      new_steps: newStepsSnapshot,
      reason, ip_address: ipAddress, user_agent: userAgent,
    });

    await adminClient.from("activity_logs").insert({
      permit_id: permitId,
      action: modificationType === "work_type_change" ? "Workflow Type Changed" : "Custom Workflow Applied",
      performed_by: userName, performed_by_id: user.id,
      details: `${reason} (auth: ${authMethod})`,
    });

    return new Response(JSON.stringify({
      success: true, modificationType,
      auditInfo: { modifiedBy: userName, timestamp: new Date().toISOString() },
    }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (error) {
    console.error("Error processing workflow modification:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
};

serve(handler);
