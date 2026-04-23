// =============================================================================
// webauthn-register-finish
//
// Receives the client's registration response (output of
// navigator.credentials.create()) and verifies it against the stored challenge.
// On success, persists the credential to webauthn_credentials.
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { verifyRegistrationResponse } from "https://esm.sh/@simplewebauthn/server@10.0.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  corsHeaders,
  getRpConfig,
  getAuthenticatedUser,
  getServiceClient,
  consumeChallenge,
  bytesToBase64Url,
  checkRateLimit,
  jsonResponse,
  errorResponse,
} from "../_shared/webauthn.ts";

const BodySchema = z.object({
  challengeId: z.string().uuid(),
  deviceName: z.string().min(1).max(100).optional(),
  // Whole response object from SimpleWebAuthn browser startRegistration()
  // Structure is validated by @simplewebauthn/server at verification time.
  response: z.record(z.unknown()),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) return errorResponse(authError || "Unauthorized", 401);

    const rl = checkRateLimit(`register-finish:${user.id}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return errorResponse(`Too many registration attempts. Try again in ${rl.retryAfter}s`, 429);
    }

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(
        "Invalid request: " + parsed.error.errors.map((e) => e.message).join(", "),
        400,
      );
    }
    const { challengeId, deviceName, response } = parsed.data;

    // Consume the challenge — this is a one-time-use token.
    const consumed = await consumeChallenge({
      challengeId,
      userId: user.id,
      purpose: "registration",
    });
    if (!consumed) {
      return errorResponse("Challenge invalid, expired, or already used", 400);
    }

    const { rpID, origins } = getRpConfig();

    let verification;
    try {
      // deno-lint-ignore no-explicit-any
      verification = await verifyRegistrationResponse({
        response: response as any,
        expectedChallenge: consumed.challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch (err) {
      console.error("Registration verification error:", err);
      return errorResponse(
        "Registration verification failed: " + (err instanceof Error ? err.message : "unknown"),
        400,
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      return errorResponse("Registration verification failed", 400);
    }

    const info = verification.registrationInfo;
    // simplewebauthn v10: registrationInfo.credential.{id,publicKey,counter}
    const credentialID = info.credential.id;  // already base64url string
    const publicKey = bytesToBase64Url(info.credential.publicKey);
    const counter = info.credential.counter;
    const aaguid = info.aaguid;
    const backupEligible = info.credentialBackedUp !== undefined
      ? info.credentialDeviceType === "multiDevice"
      : false;
    const backupState = !!info.credentialBackedUp;

    // Store credential
    const supabase = getServiceClient();
    const { data: credRow, error: insertError } = await supabase
      .from("webauthn_credentials")
      .insert({
        user_id: user.id,
        credential_id: credentialID,
        public_key: publicKey,
        counter,
        transports: (response as { response?: { transports?: string[] } })
          ?.response?.transports ?? [],
        device_name: deviceName ?? null,
        aaguid: aaguid ?? null,
        backup_eligible: backupEligible,
        backup_state: backupState,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert credential error:", insertError);
      // Unique violation on credential_id = already registered
      if (insertError.code === "23505") {
        return errorResponse("This device is already registered", 409);
      }
      return errorResponse("Failed to save credential", 500);
    }

    console.log(`WebAuthn credential registered for user ${user.email}: ${credRow.id}`);
    return jsonResponse({ verified: true, credentialId: credRow.id });
  } catch (err) {
    console.error("register-finish error:", err);
    return errorResponse(err instanceof Error ? err.message : "Unknown error", 500);
  }
});
