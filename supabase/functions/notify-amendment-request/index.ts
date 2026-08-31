// =============================================================================
// notify-amendment-request
//
// Fires when a post-approval amendment (extend schedule / add worker IDs) is
// raised on an approved permit. The request row is inserted client-side (RLS
// allows the owner/staff); this function then does the parts that need service
// privileges and were previously missing entirely:
//   1. writes an activity_logs entry on the permit, and
//   2. notifies the amendment approvers (admin + Head of Health, Safety &
//      Security) with an in-app notification and an email.
//
// Without this, an amendment silently sat in the queue with no log and no
// approver notification — so it looked like nothing happened.
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAND_RED = "#CD1719";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const appUrl = (Deno.env.get("APP_URL") || "https://hmwp.alhamra.com.kw").replace(/\/$/, "");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "").trim();

    const supaUser = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await supaUser.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { amendmentId } = await req.json();
    if (!amendmentId) return json({ error: "amendmentId is required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: amendment } = await admin
      .from("permit_amendments").select("*").eq("id", amendmentId).maybeSingle();
    if (!amendment) return json({ error: "Amendment not found" }, 404);

    // Only the requester (or internal staff) may trigger the notification for
    // their own amendment — prevents arbitrary users spamming approvers. The
    // staff check is best-effort; if the RPC signature differs it falls back to
    // requester-only, which covers the normal path.
    let isStaff = false;
    try {
      const { data } = await admin.rpc("is_non_tenant_staff", { p_user: user.id });
      isStaff = !!data;
    } catch (_) { /* fall back to requester-only */ }
    if (amendment.requested_by !== user.id && !isStaff) {
      return json({ error: "Forbidden" }, 403);
    }

    const { data: permit } = await admin.from("work_permits")
      .select("id, permit_no, requester_name, work_types(name)")
      .eq("id", amendment.permit_id).maybeSingle();
    if (!permit) return json({ error: "Permit not found" }, 404);

    const requesterName = amendment.requested_by_name || "A user";
    const change = amendment.amendment_type === "extend"
      ? `extend schedule to ${amendment.new_date_to ?? "—"} ${(amendment.new_time_to ?? "").slice(0, 5)}`.trim()
      : `add ${amendment.added_id_count ?? "additional"} worker ID(s)`;

    // 1. Activity log on the permit (mirrors how the resolve step logs).
    await admin.from("activity_logs").insert({
      permit_id: amendment.permit_id,
      action: "Amendment Requested",
      performed_by: requesterName,
      performed_by_id: amendment.requested_by,
      details: `${amendment.amendment_type === "extend" ? "Schedule extension" : "Add worker IDs"} requested — ${change}`
        + (amendment.reason ? `. Reason: ${amendment.reason}` : "")
        + ". Awaiting Health & Safety approval.",
    });

    // 2. Resolve the approver set: admin + Head of Health, Safety & Security.
    const { data: roles } = await admin.from("roles").select("id, name")
      .or("name.eq.admin,name.ilike.%health%safety%");
    const roleIds = (roles ?? []).map((r: any) => r.id);
    let approverIds: string[] = [];
    if (roleIds.length) {
      const { data: urs } = await admin.from("user_roles").select("user_id").in("role_id", roleIds);
      approverIds = Array.from(new Set((urs ?? []).map((u: any) => u.user_id)));
    }

    // In-app notifications (one per approver per amendment run).
    let inApp = 0;
    for (const uid of approverIds) {
      const { error } = await admin.from("notifications").insert({
        user_id: uid,
        permit_id: amendment.permit_id,
        type: "approval_needed",
        title: "Amendment awaiting your approval",
        message: `${requesterName} requested to ${change} on permit ${permit.permit_no}.`,
      });
      if (!error) inApp++;
    }

    // 3. Email the approvers (custom body so it renders the amendment clearly).
    let emailed = 0;
    if (approverIds.length) {
      const { data: profs } = await admin.from("profiles").select("email").in("id", approverIds);
      const emails = Array.from(new Set(
        (profs ?? []).map((p: any) => (p.email || "").trim().toLowerCase()).filter(Boolean),
      ));
      if (emails.length) {
        const link = `${appUrl}/amendments`;
        const body = `<!DOCTYPE html><html><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif;color:#1D1D1B;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;background:#f3f4f6;"><tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
              <tr><td style="background:${BRAND_RED};padding:18px 28px;color:#fff;font-size:18px;font-weight:600;">Permit Amendment — Approval Needed</td></tr>
              <tr><td style="padding:24px 28px;font-size:14px;line-height:1.6;">
                <p style="margin:0 0 12px;"><strong>${requesterName}</strong> requested an amendment on an approved permit:</p>
                <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse;">
                  <tr><td style="padding:6px 0;color:#6B7280;width:130px;">Permit</td><td style="padding:6px 0;font-weight:600;">${permit.permit_no}</td></tr>
                  <tr><td style="padding:6px 0;color:#6B7280;">Requested by</td><td style="padding:6px 0;">${requesterName}</td></tr>
                  <tr><td style="padding:6px 0;color:#6B7280;">Change</td><td style="padding:6px 0;">${change}</td></tr>
                  ${amendment.reason ? `<tr><td style="padding:6px 0;color:#6B7280;">Reason</td><td style="padding:6px 0;">${amendment.reason}</td></tr>` : ""}
                </table>
                <div style="text-align:center;margin:24px 0 4px;">
                  <a href="${link}" style="display:inline-block;background:${BRAND_RED};color:#fff;text-decoration:none;padding:11px 26px;border-radius:8px;font-weight:600;">Review amendment</a>
                </div>
                <p style="margin:14px 0 0;font-size:12px;color:#9CA3AF;">Al Hamra Work Permit System — Health &amp; Safety approval.</p>
              </td></tr>
            </table>
          </td></tr></table></body></html>`;
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              to: emails,
              subject: `Amendment approval needed: ${permit.permit_no}`,
              notificationType: "approval_required",
              permitNo: permit.permit_no,
              permitId: amendment.permit_id,
              body,
            }),
          });
          if (resp.ok) emailed = emails.length;
          else console.error("amendment-request email failed:", resp.status, await resp.text());
        } catch (e) {
          console.error("amendment-request email threw:", e);
        }
      }
    }

    return json({ success: true, approvers: approverIds.length, inApp, emailed });
  } catch (error) {
    console.error("notify-amendment-request error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});
