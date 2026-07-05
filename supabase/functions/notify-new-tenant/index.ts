// =============================================================================
// notify-new-tenant
//
// Emails the admin team when a new tenant self-registers and lands in the
// Pending Tenant Approvals queue, so an admin knows someone is waiting.
//
// Why an edge function: tenant signup is UNAUTHENTICATED (the account is
// 'pending' and can't sign in yet), so the browser can't call
// send-email-notification (which needs auth) or resolve admin emails under RLS.
// This function runs with the service role and does both server-side.
//
// Public (verify_jwt = false) but spam-safe: it only sends when a profile with
// the given email actually exists AND is still 'pending', and it's IP
// rate-limited. It never returns tenant/admin data to the caller.
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Basic in-memory IP rate limit (per edge instance): 10 requests / 10 min.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 10;
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

  // Generic success — never leaks whether the email/account exists.
  const ok = () =>
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (rateLimited(ip)) {
      return new Response(JSON.stringify({ error: "Too many requests." }), {
        status: 429,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { email } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string") return ok();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Validate: a real profile with this email that is still pending. This gates
    // the endpoint so it can't be used to spam admins with arbitrary content.
    const { data: tenant } = await admin
      .from("profiles")
      .select("full_name, email, company_name, phone, account_status")
      .ilike("email", email)
      .maybeSingle();

    if (!tenant || tenant.account_status !== "pending") {
      // No pending account for this email — nothing to notify about.
      return ok();
    }

    // Resolve admin recipients server-side (SECURITY DEFINER RPC with fallback
    // to auth.users.email when a profile email is blank).
    const { data: roleEmails } = await admin.rpc("get_emails_for_role", {
      p_role_name: "admin",
    });
    const adminEmails: string[] = (roleEmails?.emails ?? []).filter(
      (e: unknown): e is string => typeof e === "string" && e.trim() !== "",
    );

    if (adminEmails.length === 0) {
      console.warn("notify-new-tenant: no admin emails resolved; nothing sent.");
      return ok();
    }

    const resp = await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        to: adminEmails,
        notificationType: "account_pending_review",
        subject: "New tenant application — review required",
        details: {
          tenantName: tenant.full_name || "",
          tenantEmail: tenant.email || email,
          tenantCompany: tenant.company_name || "",
          tenantPhone: tenant.phone || "",
        },
      }),
    });
    if (!resp.ok) {
      console.error("notify-new-tenant: email dispatch failed:", resp.status, await resp.text());
    }

    return ok();
  } catch (err) {
    console.error("notify-new-tenant error:", err);
    return ok();
  }
});
