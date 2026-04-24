// =============================================================================
// webauthn-auth-challenge
//
// Issues a WebAuthn authentication challenge bound to a specific action.
// The client uses this to call navigator.credentials.get() — the resulting
// assertion is sent to verify-signature-approval which validates the binding.
//
// Binding means: an assertion obtained for permit A / role X / action=approve
// CANNOT be replayed to approve permit B, or to reject permit A, etc. This is
// the critical property that makes step-up authentication meaningful.
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { generateAuthenticationOptions } from "https://esm.sh/@simplewebauthn/server@11.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  corsHeaders,
  getRpConfig,
  getAuthenticatedUser,
  getServiceClient,
  storeChallenge,
  checkRateLimit,
  jsonResponse,
  errorResponse,
  type ChallengeBinding,
} from "../_shared/webauthn.ts";

const BodySchema = z.object({
  purpose: z.enum(["approval", "workflow_modify"]),
  binding: z.object({
    permitId: z.string().uuid().optional(),
    gatePassId: z.string().uuid().optional(),
    role: z.string().min(1).max(100).optional(),
    action: z.enum(["approve", "reject"]).optional(),
  }),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) return errorResponse(authError || "Unauthorized", 401);

    // Tight rate limit: prevents mass challenge generation
    const rl = checkRateLimit(`auth-challenge:${user.id}`, 30, 15 * 60 * 1000);
    if (!rl.allowed) {
      return errorResponse(`Too many requests. Try again in ${rl.retryAfter}s`, 429);
    }

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(
        "Invalid request: " + parsed.error.errors.map((e) => e.message).join(", "),
        400,
      );
    }
    const { purpose, binding } = parsed.data;

    // For approval purpose, require at least one resource identifier
    if (purpose === "approval" && !binding.permitId && !binding.gatePassId) {
      return errorResponse("Approval challenge requires permitId or gatePassId", 400);
    }

    const { rpID } = getRpConfig();

    // Fetch user's registered credentials so the authenticator knows which to use
    const supabase = getServiceClient();
    const { data: creds } = await supabase
      .from("webauthn_credentials")
      .select("credential_id, transports")
      .eq("user_id", user.id);

    if (!creds || creds.length === 0) {
      return errorResponse(
        "No biometric credentials registered. Please register a device in Settings.",
        412,
      );
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: creds.map((c) => ({
        id: c.credential_id,
        transports: (c.transports as AuthenticatorTransport[] | null) ?? undefined,
      })),
      timeout: 60_000,
    });

    const challengeId = await storeChallenge({
      userId: user.id,
      purpose,
      challenge: options.challenge,
      binding: binding as ChallengeBinding,
      ttlSeconds: 120, // short — action-bound challenges expire fast
    });

    return jsonResponse({ options, challengeId });
  } catch (err) {
    console.error("auth-challenge error:", err);
    return errorResponse(err instanceof Error ? err.message : "Unknown error", 500);
  }
});
