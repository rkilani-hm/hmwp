// =============================================================================
// Shared WebAuthn helpers + config for Supabase edge functions.
//
// Env vars required:
//   WEBAUTHN_RP_ID      e.g. "hmwp.lovable.app" or "permits.alhamra.com.kw"
//   WEBAUTHN_RP_NAME    human-readable, e.g. "Al Hamra Work Permit System"
//   WEBAUTHN_ORIGINS    comma-separated list of allowed origins, e.g.
//                       "https://hmwp.lovable.app,https://permits.alhamra.com.kw"
//
// Uses @simplewebauthn/server v10 via esm.sh.
// =============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// RP configuration
// ---------------------------------------------------------------------------
export function getRpConfig() {
  const rpID = Deno.env.get("WEBAUTHN_RP_ID");
  const rpName = Deno.env.get("WEBAUTHN_RP_NAME") || "Al Hamra Work Permit System";
  const originsRaw = Deno.env.get("WEBAUTHN_ORIGINS") || "";

  if (!rpID) {
    throw new Error("WEBAUTHN_RP_ID environment variable must be set");
  }

  const origins = originsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error("WEBAUTHN_ORIGINS environment variable must be set (comma-separated list)");
  }

  return { rpID, rpName, origins };
}

// ---------------------------------------------------------------------------
// Supabase clients
// ---------------------------------------------------------------------------
export function getServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Auth helper: extract user from bearer token
// ---------------------------------------------------------------------------
export async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { user: null, error: "No authorization header" };
  }
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const supabase = getServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { user: null, error: error?.message || "Invalid token" };
  }
  return { user: data.user, error: null };
}

// ---------------------------------------------------------------------------
// Base64url helpers (WebAuthn uses base64url throughout)
// ---------------------------------------------------------------------------
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Challenge storage
// ---------------------------------------------------------------------------
export interface ChallengeBinding {
  // Used by 'approval' purpose to bind to a specific permit+role+action.
  // Any of these fields may be present depending on context.
  permitId?: string;
  gatePassId?: string;
  role?: string;
  action?: "approve" | "reject";
  [key: string]: unknown;
}

export async function storeChallenge(opts: {
  userId: string;
  purpose: "registration" | "approval" | "workflow_modify";
  challenge: string;
  binding?: ChallengeBinding;
  ttlSeconds?: number;
}): Promise<string> {
  const { userId, purpose, challenge, binding = {}, ttlSeconds = 300 } = opts;
  const supabase = getServiceClient();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const { data, error } = await supabase
    .from("webauthn_challenges")
    .insert({
      user_id: userId,
      purpose,
      challenge,
      binding,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to store challenge: ${error?.message}`);
  }
  return data.id as string;
}

export async function consumeChallenge(opts: {
  challengeId: string;
  userId: string;
  purpose: "registration" | "approval" | "workflow_modify";
  requiredBinding?: ChallengeBinding;
}): Promise<{ challenge: string; binding: ChallengeBinding } | null> {
  const { challengeId, userId, purpose, requiredBinding } = opts;
  const supabase = getServiceClient();

  // Opportunistic cleanup of old rows
  await supabase.rpc("cleanup_expired_webauthn_challenges").then(() => null, () => null);

  const { data: row, error } = await supabase
    .from("webauthn_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .eq("consumed", false)
    .maybeSingle();

  if (error || !row) return null;

  // Check expiry
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  // Check binding — every field in requiredBinding must match the stored value
  if (requiredBinding) {
    for (const [k, v] of Object.entries(requiredBinding)) {
      if (v === undefined) continue;
      if ((row.binding as Record<string, unknown>)[k] !== v) {
        return null;
      }
    }
  }

  // Mark consumed (one-time use)
  const { error: updateError } = await supabase
    .from("webauthn_challenges")
    .update({ consumed: true })
    .eq("id", challengeId)
    .eq("consumed", false);  // guard against race

  if (updateError) return null;

  return {
    challenge: row.challenge as string,
    binding: (row.binding as ChallengeBinding) || {},
  };
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, per-edge-instance; suitable for moderate load)
// ---------------------------------------------------------------------------
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const rec = rateLimitStore.get(key);
  if (!rec || now > rec.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (rec.count >= maxRequests) {
    return { allowed: false, retryAfter: Math.ceil((rec.resetAt - now) / 1000) };
  }
  rec.count++;
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ---------------------------------------------------------------------------
// Device info for audit
// ---------------------------------------------------------------------------
export function extractDeviceInfo(req: Request) {
  const ua = req.headers.get("user-agent") || "unknown";
  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  const platform = ua.includes("Windows") ? "Windows"
    : ua.includes("Mac") ? "macOS"
    : ua.includes("iPhone") || ua.includes("iPad") ? "iOS"
    : ua.includes("Android") ? "Android"
    : ua.includes("Linux") ? "Linux"
    : "Unknown";
  const browser = ua.includes("Edg/") ? "Edge"
    : ua.includes("Chrome/") ? "Chrome"
    : ua.includes("Firefox/") ? "Firefox"
    : ua.includes("Safari/") ? "Safari"
    : "Unknown";
  return { platform, browser, userAgent: ua, ipAddress: ip };
}
