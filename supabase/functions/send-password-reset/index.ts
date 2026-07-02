// =============================================================================
// send-password-reset
//
// Self-service password reset that goes through the SAME Microsoft Graph email
// pipeline as every other notification (send-email-notification), instead of
// Supabase's built-in auth mailer.
//
// Why: supabase.auth.resetPasswordForEmail() depends on Supabase's SMTP being
// configured, which it isn't here — so reset emails were unreliable/undelivered.
// This function generates the recovery link with the admin API and emails it
// via Graph, so resets are delivered (and logged in email_delivery_logs) like
// approver/tenant notifications.
//
// Public (verify_jwt = false) — locked-out users must be able to call it. It is
// enumeration-safe (always returns success) and IP rate-limited.
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Basic in-memory IP rate limit (per edge instance): 5 requests / 15 min.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = rateLimitStore.get(ip);
  if (!rec || now > rec.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (rec.count >= MAX_PER_WINDOW) return true;
  rec.count++;
  return false;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Always resolves to a generic success so account existence never leaks.
  const ok = () =>
    new Response(
      JSON.stringify({ success: true, message: "If an account exists, a reset link has been sent." }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (rateLimited(ip)) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please wait a few minutes and try again." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { email, redirectTo } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string") {
      // Malformed request — still generic so we don't hint at validation.
      return ok();
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Generate the recovery link. This does NOT send an email — it returns the
    // action_link for us to deliver ourselves via Graph.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });

    if (error || !data?.properties?.action_link) {
      // Unknown email or generation error — stay generic (no enumeration).
      console.warn("send-password-reset: no link generated for request:", error?.message);
      return ok();
    }

    const resetUrl = data.properties.action_link;

    // Deliver via the Graph pipeline (send-email-notification, service-role auth).
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [email],
          notificationType: "password_reset",
          subject: "Reset your Al Hamra Work Permit password",
          details: { resetUrl },
        }),
      });
      if (!resp.ok) {
        console.error("send-password-reset: email dispatch failed:", resp.status, await resp.text());
      }
    } catch (e) {
      console.error("send-password-reset: email dispatch threw:", e);
    }

    return ok();
  } catch (err) {
    console.error("send-password-reset error:", err);
    // Never surface internals; keep the flow enumeration-safe.
    return ok();
  }
});
