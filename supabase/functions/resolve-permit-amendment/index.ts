// =============================================================================
// resolve-permit-amendment
//
// A Head of Health, Safety & Security (or admin) approves/rejects a post-
// approval amendment (extend schedule / add worker IDs). On approval the change
// is applied to the permit, the approved PDF is regenerated, and it is re-
// emailed to the tenant + helpdesk (+ the on-behalf creator).
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "").trim();

    const supaUser = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await supaUser.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: canApprove } = await admin.rpc("can_approve_amendment", { p_user: user.id });
    if (!canApprove) return json({ error: "Forbidden — Health & Safety / admin only" }, 403);

    const { amendmentId, approve, comment } = await req.json();
    if (!amendmentId || typeof approve !== "boolean") {
      return json({ error: "amendmentId and approve are required" }, 400);
    }

    const { data: amendment } = await admin.from("permit_amendments").select("*").eq("id", amendmentId).maybeSingle();
    if (!amendment) return json({ error: "Amendment not found" }, 404);
    if (amendment.status !== "pending") return json({ error: "Amendment already resolved" }, 409);

    const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
    const approverName = profile?.full_name || user.email || "Approver";

    const { data: permit } = await admin.from("work_permits")
      .select("id, permit_no, requester_email, created_on_behalf_by, work_types(name)")
      .eq("id", amendment.permit_id).maybeSingle();

    // Apply the change on approval.
    let summary = "";
    if (approve) {
      if (amendment.amendment_type === "extend") {
        const upd: Record<string, unknown> = {};
        if (amendment.new_date_to) upd.work_date_to = amendment.new_date_to;
        if (amendment.new_time_to) upd.work_time_to = amendment.new_time_to;
        if (Object.keys(upd).length) await admin.from("work_permits").update(upd).eq("id", amendment.permit_id);
        summary = `extended to ${amendment.new_date_to ?? "—"} ${amendment.new_time_to ?? ""}`.trim();
      } else {
        summary = `${amendment.added_id_count ?? "additional"} worker ID(s) added`;
      }
    }

    // Record resolution.
    await admin.from("permit_amendments").update({
      status: approve ? "approved" : "rejected",
      resolved_by: user.id, resolved_by_name: approverName,
      resolved_at: new Date().toISOString(),
      resolution_comment: comment || null,
    }).eq("id", amendmentId);

    await admin.from("activity_logs").insert({
      permit_id: amendment.permit_id,
      action: approve ? "Amendment Approved" : "Amendment Rejected",
      performed_by: approverName,
      performed_by_id: user.id,
      details: `${amendment.amendment_type === "extend" ? "Schedule extension" : "Added worker IDs"}`
        + (approve ? ` approved — ${summary}` : " rejected")
        + (comment ? `. ${comment}` : ""),
    });

    // On approval: regenerate the PDF and re-email it (background).
    if (approve && permit) {
      const deliver = async () => {
        try {
          await fetch(`${supabaseUrl}/functions/v1/generate-permit-pdf`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ permitId: amendment.permit_id }),
          });
        } catch (e) { console.error("amendment PDF regen error:", e); }
        try {
          const recipients = new Set<string>();
          if (permit.requester_email) recipients.add(String(permit.requester_email).trim().toLowerCase());
          const { data: hd } = await admin.rpc("get_emails_for_role", { p_role_name: "helpdesk" });
          for (const e of (hd?.emails ?? [])) if (typeof e === "string" && e.trim()) recipients.add(e.trim().toLowerCase());
          if (permit.created_on_behalf_by) {
            const { data: cr } = await admin.from("profiles").select("email").eq("id", permit.created_on_behalf_by).maybeSingle();
            if (cr?.email) recipients.add(String(cr.email).trim().toLowerCase());
          }
          if (recipients.size) {
            await fetch(`${supabaseUrl}/functions/v1/email-permit-pdf`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ permitId: amendment.permit_id, recipients: Array.from(recipients) }),
            });
          }
        } catch (e) { console.error("amendment email error:", e); }
      };
      const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
      if (er?.waitUntil) er.waitUntil(deliver()); else deliver().catch((e) => console.error(e));
    }

    return json({ success: true, status: approve ? "approved" : "rejected" });
  } catch (error) {
    console.error("resolve-permit-amendment error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});
