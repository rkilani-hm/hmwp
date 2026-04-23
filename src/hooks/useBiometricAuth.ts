// =============================================================================
// useBiometricAuth
//
// PHASE 1 REWRITE — real WebAuthn flow.
// Replaces the previous stubbed "verifyIdentity" that threw away the assertion
// and trusted the client's word.
//
// Uses @simplewebauthn/browser for the public-key ceremony, and three edge
// functions for the server-side challenge + verification:
//   - webauthn-register-begin / webauthn-register-finish  (enrol a device)
//   - webauthn-auth-challenge                             (issue action-bound challenge)
//
// The assertion returned by `authenticateForApproval` is NOT trusted by itself
// — it must be submitted to verify-signature-approval with its challengeId,
// where the server validates the signature against the stored public key AND
// checks the action binding (permitId + role + action).
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";
import { supabase } from "@/integrations/supabase/client";

export interface BiometricAuthAssertion {
  challengeId: string;
  // Serialized PublicKeyCredential (from @simplewebauthn/browser startAuthentication)
  // deno-lint-ignore no-explicit-any
  assertion: any;
}

export interface RegisteredCredential {
  id: string;
  device_name: string | null;
  transports: string[] | null;
  created_at: string;
  last_used_at: string | null;
  backup_state: boolean;
}

async function invokeEdge<T>(
  name: string,
  body?: Record<string, unknown>,
  method: "POST" | "GET" = "POST",
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    method,
  });
  if (error) {
    // supabase-js wraps edge errors — try to surface the useful message
    const message =
      // deno-lint-ignore no-explicit-any
      (error as any)?.context?.error || error.message || "Edge function error";
    throw new Error(message);
  }
  return data as T;
}

export function useBiometricAuth() {
  const [isSupported, setIsSupported] = useState(false);
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const supported = browserSupportsWebAuthn();
        setIsSupported(supported);
        if (supported) {
          const available = await platformAuthenticatorIsAvailable();
          setPlatformAvailable(available);
        }
      } catch {
        setIsSupported(false);
        setPlatformAvailable(false);
      } finally {
        setIsChecking(false);
      }
    })();
  }, []);

  // ------------------------------------------------------------------------
  // Register a new platform authenticator (biometric device)
  // ------------------------------------------------------------------------
  const registerCredential = useCallback(
    async (deviceName?: string): Promise<{ success: true } | { success: false; error: string }> => {
      if (!isSupported) return { success: false, error: "WebAuthn not supported on this browser" };

      try {
        const { options, challengeId } = await invokeEdge<{
          options: Parameters<typeof startRegistration>[0]["optionsJSON"];
          challengeId: string;
        }>("webauthn-register-begin");

        // Browser prompts biometric now
        const attestation = await startRegistration({ optionsJSON: options });

        await invokeEdge("webauthn-register-finish", {
          challengeId,
          deviceName: deviceName || inferDeviceName(),
          response: attestation,
        });

        return { success: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Registration failed";
        // User-cancelled
        if (msg.includes("NotAllowed") || msg.includes("cancelled") || msg.includes("AbortError")) {
          return { success: false, error: "Registration cancelled" };
        }
        return { success: false, error: msg };
      }
    },
    [isSupported],
  );

  // ------------------------------------------------------------------------
  // Produce an assertion bound to a specific approval action.
  // Caller must pass the resulting { challengeId, assertion } through to
  // verify-signature-approval; verification happens server-side only.
  // ------------------------------------------------------------------------
  const authenticateForApproval = useCallback(
    async (binding: {
      permitId?: string;
      gatePassId?: string;
      role: string;
      action: "approve" | "reject";
    }): Promise<{ ok: true; data: BiometricAuthAssertion } | { ok: false; error: string }> => {
      if (!isSupported) return { ok: false, error: "WebAuthn not supported" };

      try {
        const { options, challengeId } = await invokeEdge<{
          options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
          challengeId: string;
        }>("webauthn-auth-challenge", {
          purpose: "approval",
          binding,
        });

        const assertion = await startAuthentication({ optionsJSON: options });

        return { ok: true, data: { challengeId, assertion } };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Biometric authentication failed";
        if (msg.includes("NotAllowed") || msg.includes("cancelled") || msg.includes("AbortError")) {
          return { ok: false, error: "Authentication cancelled" };
        }
        // 412 Precondition Failed = no registered credential
        if (msg.includes("No biometric credentials registered")) {
          return {
            ok: false,
            error: "No biometric device registered. Please add one in Settings → Security.",
          };
        }
        return { ok: false, error: msg };
      }
    },
    [isSupported],
  );

  // ------------------------------------------------------------------------
  // List / delete registered credentials
  // ------------------------------------------------------------------------
  const listCredentials = useCallback(async (): Promise<RegisteredCredential[]> => {
    const { credentials } = await invokeEdge<{ credentials: RegisteredCredential[] }>(
      "webauthn-credentials-list",
    );
    return credentials;
  }, []);

  const deleteCredential = useCallback(async (credentialRowId: string): Promise<void> => {
    await invokeEdge("webauthn-credentials-delete", { credentialRowId });
  }, []);

  return {
    isSupported,
    platformAvailable,
    isChecking,
    registerCredential,
    authenticateForApproval,
    listCredentials,
    deleteCredential,
  };
}

// ------------------------------------------------------------------------
// Best-effort friendly device label from user agent.
// ------------------------------------------------------------------------
function inferDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android device";
  if (/Windows/.test(ua)) return "Windows device";
  return "This device";
}
