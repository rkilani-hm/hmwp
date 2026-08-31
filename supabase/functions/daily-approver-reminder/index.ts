// =============================================================================
// daily-approver-reminder
//
// Scheduled (daily via pg_cron) reminder to every approver who currently has
// work permits awaiting their action. One email per approver, listing ALL
// permits pending with them right now (any age — no threshold).
//
// "Pending with them" comes from approver_pending_digest(), which is built on
// the same permit_active_approvers view the inbox uses, so the reminder matches
// what the approver actually sees in "Pending with Me".
//
// Auth: service-role bearer (the cron caller) OR an authenticated admin (manual
// trigger for testing). Mirrors check-sla-breach.
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAND_RED = "#CD1719";
const BRAND_DARK = "#1D1D1B";

interface DigestRow {
  approver_id: string;
  email: string;
  full_name: string | null;
  permit_id: string;
  permit_no: string;
  status: string;
  role_label: string;
  requester_name: string | null;
  contractor_name: string | null;
  work_location: string | null;
  sla_deadline: string | null;
  sla_breached: boolean;
  created_at: string;
  urgency: string | null;
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function daysAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(ms / 3_600_000);
  return `${Math.max(hours, 0)} hour${hours === 1 ? "" : "s"} ago`;
}

// SLA state label for one permit.
function slaState(row: DigestRow): { label: string; color: string } {
  if (row.sla_breached) return { label: "SLA breached", color: BRAND_RED };
  if (row.sla_deadline) {
    const hoursLeft = (new Date(row.sla_deadline).getTime() - Date.now()) / 3_600_000;
    if (hoursLeft <= 0) return { label: "Overdue", color: BRAND_RED };
    if (hoursLeft <= 4) return { label: `Due in ${Math.round(hoursLeft)}h`, color: "#B45309" };
    return { label: "On track", color: "#15803D" };
  }
  return { label: "—", color: "#6B7280" };
}

function buildEmail(name: string, rows: DigestRow[], appUrl: string): string {
  const inboxUrl = `${appUrl}/approver-inbox`;
  const count = rows.length;
  // Oldest first so the most-overdue items are at the top.
  rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const tableRows = rows.map((r) => {
    const st = slaState(r);
    const who = r.contractor_name || r.requester_name || "—";
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;color:${BRAND_DARK};">${esc(r.permit_no)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#374151;">${esc(r.role_label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#374151;">${esc(who)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#6B7280;white-space:nowrap;">${esc(daysAgo(r.created_at))}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;color:${st.color};white-space:nowrap;">${esc(st.label)}</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif;color:${BRAND_DARK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${BRAND_RED};padding:20px 32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">Permits Awaiting Your Approval</h1>
          <div dir="rtl" lang="ar" style="margin-top:6px;color:#fff;font-size:16px;">تصاريح بانتظار موافقتك</div>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 8px;font-size:15px;">Hello ${esc(name || "there")},</p>
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">
            You have <strong>${count}</strong> work permit${count === 1 ? "" : "s"} waiting for your approval. Please review ${count === 1 ? "it" : "them"} at your earliest convenience.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:#F9FAFB;text-align:left;">
              <th style="padding:10px 12px;border-bottom:2px solid #eee;color:#6B7280;font-weight:600;">Permit</th>
              <th style="padding:10px 12px;border-bottom:2px solid #eee;color:#6B7280;font-weight:600;">Your role</th>
              <th style="padding:10px 12px;border-bottom:2px solid #eee;color:#6B7280;font-weight:600;">Contractor / requester</th>
              <th style="padding:10px 12px;border-bottom:2px solid #eee;color:#6B7280;font-weight:600;">Submitted</th>
              <th style="padding:10px 12px;border-bottom:2px solid #eee;color:#6B7280;font-weight:600;">SLA</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div style="text-align:center;margin:28px 0 8px;">
            <a href="${inboxUrl}" style="display:inline-block;background:${BRAND_RED};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">Open my inbox</a>
          </div>
          <p style="margin:16px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">
            This is an automated daily reminder from the Al Hamra Work Permit System.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const appUrl = (Deno.env.get("APP_URL") || "https://hmwp.alhamra.com.kw").replace(/\/$/, "");

    const admin = createClient(supabaseUrl, serviceKey);

    // Auth — any ONE of:
    //   (a) x-reminder-secret header matching REMINDER_CRON_SECRET (the pg_cron
    //       caller; used because the service-role key isn't reachable from SQL),
    //   (b) the service-role key as the bearer, or
    //   (c) an authenticated admin user (the "Send reminders now" button).
    const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
    const providedSecret = req.headers.get("x-reminder-secret");
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    let authorized = false;
    if (cronSecret && providedSecret && providedSecret === cronSecret) {
      authorized = true;
    } else if (token && token === serviceKey) {
      authorized = true;
    } else if (token) {
      const { data: { user } } = await admin.auth.getUser(token);
      if (user) {
        const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (isAdmin) authorized = true;
      }
    }
    if (!authorized) return json({ error: "Unauthorized" }, 401);

    // Pull the pending-with-approver rows and group by approver.
    const { data: rows, error: digestErr } = await admin.rpc("approver_pending_digest");
    if (digestErr) {
      console.error("approver_pending_digest failed:", digestErr);
      return json({ error: "Failed to build digest" }, 500);
    }

    const byApprover = new Map<string, DigestRow[]>();
    for (const r of (rows ?? []) as DigestRow[]) {
      if (!r.email) continue;
      const list = byApprover.get(r.approver_id) ?? [];
      list.push(r);
      byApprover.set(r.approver_id, list);
    }

    console.log(`daily-approver-reminder: ${byApprover.size} approver(s) with pending permits`);

    let sent = 0;
    let failed = 0;
    for (const [, list] of byApprover) {
      const to = list[0].email;
      const name = list[0].full_name || "";
      const body = buildEmail(name, list, appUrl);
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [to],
            subject: `Reminder: ${list.length} work permit${list.length === 1 ? "" : "s"} awaiting your approval`,
            notificationType: "status_update",
            body,
          }),
        });
        if (resp.ok) {
          sent++;
        } else {
          failed++;
          console.error(`Reminder email to ${to} failed:`, resp.status, await resp.text());
        }
      } catch (e) {
        failed++;
        console.error(`Reminder email to ${to} threw:`, e);
      }
      // Space out sends to stay under the email function's rate limit.
      await new Promise((r) => setTimeout(r, 300));
    }

    return json({ success: true, approvers: byApprover.size, sent, failed });
  } catch (error) {
    console.error("daily-approver-reminder error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});
