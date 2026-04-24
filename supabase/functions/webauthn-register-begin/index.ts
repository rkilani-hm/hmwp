// =============================================================================
// webauthn-register-begin
//
// Returns PublicKeyCredentialCreationOptions for the currently authenticated
// user to register a new WebAuthn credential (platform authenticator).
//
// The server generates the challenge, stores it bound to this user with
// purpose='registration', and returns it for the client to pass to
// navigator.credentials.create().
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { generateRegistrationOptions } from "https://esm.sh/@simplewebauthn/server@11.0.0";
import {
  corsHeaders,
  getRpConfig,
  getAuthenticatedUser,
  getServiceClient,
  storeChallenge,
  checkRateLimit,
  jsonResponse,
  errorResponse,
} from "../_shared/webauthn.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) return errorResponse(authError || "Unauthorized", 401);

    // Rate limit: 10 registration attempts per user per 15 minutes
    const rl = checkRateLimit(`register-begin:${user.id}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return errorResponse(`Too many registration attempts. Try again in ${rl.retryAfter}s`, 429);
    }

    const { rpID, rpName } = getRpConfig();

    // Fetch existing credentials so the authenticator excludes them
    const supabase = getServiceClient();
    const { data: existing } = await supabase
      .from("webauthn_credentials")
      .select("credential_id, transports")
      .eq("user_id", user.id);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email ?? user.id,
      userDisplayName: user.email ?? "User",
      attestationType: "none",
      excludeCredentials: (existing ?? []).map((c) => ({
        id: c.credential_id,
        transports: (c.transports as AuthenticatorTransport[] | null) ?? undefined,
      })),
      authenticatorSelection: {
        authenticatorAttachment: "platform", // require on-device biometric
        userVerification: "required",
        residentKey: "preferred",
      },
      // 60-second challenge lifetime at the client; we enforce 5-min at server
      timeout: 60_000,
    });

    const challengeId = await storeChallenge({
      userId: user.id,
      purpose: "registration",
      challenge: options.challenge,
      ttlSeconds: 300,
    });

    return jsonResponse({ options, challengeId });
  } catch (err) {
    console.error("register-begin error:", err);
    return errorResponse(err instanceof Error ? err.message : "Unknown error", 500);
  }
});
