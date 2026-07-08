// =============================================================================
// invite-tenant
//
// Admin-only. Invites a tenant by email: creates their account (approved,
// tenant role, no password yet) and emails an invitation link (via the Graph
// pipeline) where the tenant sets a password and completes their onboarding
// details (name, company, phone, units).
//
// The link carries a recovery token_hash and lands on /accept-invite. The
// token is only consumed when that page runs verifyOtp, so email link-scanners
// don't burn it (same approach as password reset).
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const InviteSchema = z.object({
  email: z.string().email("Invalid email").max(255).transform((v) => v.toLowerCase().trim()),
  fullName: z.string().max(120).transform((v) => v.trim()).optional(),
  companyName: z.string().max(120).transform((v) => v.trim()).optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const appUrl = (Deno.env.get("APP_URL") || "https://hmwp.alhamra.com.kw").replace(/\/$/, "");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    // Verify caller identity + admin role.
    const supaUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supaUser.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: adminRole } = await admin
      .from("user_roles").select("role_id, roles!inner(name)")
      .eq("user_id", user.id).eq("roles.name", "admin").maybeSingle();
    if (!adminRole) return json({ error: "Forbidden - Admin access required" }, 403);

    const parsed = InviteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, 400);
    }
    const { email, fullName, companyName } = parsed.data;

    // Reject if an account already exists for this email.
    const { data: existing } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (existing) return json({ error: "An account with this email already exists." }, 409);

    // Create the tenant account. admin_created => the trigger lands it as
    // account_status='approved' (admin-vetted) but assigns no role, so we add
    // the tenant role explicitly. No password: the tenant sets it via the link.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || "",
        company_name: companyName || "",
        admin_created: "true",
        invited_tenant: "true",
      },
    });
    if (createError || !created?.user) {
      const msg = createError?.message || "Failed to create account";
      const status = /already|exist|registered/i.test(msg) ? 409 : 400;
      return json({ error: msg }, status);
    }
    const newUserId = created.user.id;

    // Make sure profile carries the provided details (trigger may race metadata).
    await admin.from("profiles").update({
      email,
      full_name: fullName || null,
      company_name: companyName || null,
    }).eq("id", newUserId);

    // Assign the tenant role.
    const { data: tenantRole } = await admin.from("roles").select("id").eq("name", "tenant").maybeSingle();
    if (tenantRole?.id) {
      await admin.from("user_roles").insert({ user_id: newUserId, role_id: tenantRole.id });
    }

    // Generate the recovery token and build the invite link to our page.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error("invite-tenant: link generation failed:", linkError);
      return json({ error: "Account created but invite link could not be generated. Use 'resend invite'." }, 500);
    }
    const inviteUrl = `${appUrl}/accept-invite?token_hash=${encodeURIComponent(tokenHash)}&type=invite`;

    // Email the invitation via the Graph pipeline.
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        to: [email],
        notificationType: "tenant_invitation",
        subject: "You're invited to the Al Hamra Work Permit System",
        details: { inviteUrl, tenantName: fullName || "" },
      }),
    });
    if (!resp.ok) {
      console.error("invite-tenant: email dispatch failed:", resp.status, await resp.text());
      return json({ error: "Account created but the invitation email failed to send." }, 502);
    }

    return json({ success: true, userId: newUserId, email });
  } catch (error) {
    console.error("invite-tenant error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});
