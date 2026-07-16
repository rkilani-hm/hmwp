// =============================================================================
// public-permit-details
//
// Full work-permit view for the public /status (QR verification) page:
// details, schedule, contractor, approval chain, and attachments (as
// short-lived signed URLs). Lets security see the complete permit at the gate
// by scanning the QR — matching what the printed PDF already shows.
//
// Public (verify_jwt = false) but IP rate-limited to slow permit-number
// enumeration. NOTE: because lookup is by permit number, anyone with a valid
// number can view the permit — a QR-embedded secret token is the recommended
// hardening step later.
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 30 lookups / 5 min per IP — generous for a gate, hostile to enumeration.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const rl = new Map<string, { count: number; resetTime: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = rl.get(ip);
  if (!rec || now > rec.resetTime) { rl.set(ip, { count: 1, resetTime: now + WINDOW_MS }); return false; }
  if (rec.count >= MAX_PER_WINDOW) return true;
  rec.count++; return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (rateLimited(ip)) return json({ error: "Too many lookups. Please wait a few minutes." }, 429);

    const { permitNo } = await req.json().catch(() => ({}));
    if (!permitNo || typeof permitNo !== "string") return json({ error: "permitNo is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: permit } = await admin
      .from("work_permits")
      .select(`id, permit_no, status, urgency, created_at,
               requester_name, requester_email, contractor_name, contact_mobile,
               work_description, work_location, unit, floor, building_zone, back_of_house,
               work_date_from, work_date_to, work_time_from, work_time_to,
               is_archived, work_types(name)`)
      .ilike("permit_no", permitNo.trim())
      .maybeSingle();

    if (!permit || permit.is_archived) return json({ error: "Permit not found" }, 404);

    // Approval chain (role, status, approver, date — no signature images).
    const { data: approvals } = await admin
      .from("permit_approvals")
      .select("role_name, status, approver_name, approved_at, workflow_steps(step_order)")
      .eq("permit_id", permit.id);
    const chain = (approvals ?? [])
      .map((a: any) => ({
        role: a.role_name, status: a.status, approver: a.approver_name, date: a.approved_at,
        order: (Array.isArray(a.workflow_steps) ? a.workflow_steps[0]?.step_order : a.workflow_steps?.step_order) ?? 999,
      }))
      .sort((a: any, b: any) => a.order - b.order);

    // Attachments with 1-hour signed URLs.
    const { data: rows } = await admin
      .from("permit_attachments")
      .select("file_path, file_name, mime_type, document_type")
      .eq("permit_id", permit.id)
      .order("created_at", { ascending: true });

    const attachments: Array<{ name: string; type: string; mime: string | null; url: string | null }> = [];
    for (const r of rows ?? []) {
      let url: string | null = null;
      try {
        const { data: signed } = await admin.storage.from("permit-attachments").createSignedUrl(r.file_path, 3600);
        url = signed?.signedUrl ?? null;
      } catch (_) { /* leave null */ }
      attachments.push({ name: r.file_name || r.file_path.split("/").pop() || "file", type: r.document_type || "other", mime: r.mime_type, url });
    }

    const { is_archived: _skip, id: _id, ...pub } = permit as Record<string, unknown>;
    return json({ permit: pub, approvals: chain, attachments });
  } catch (error) {
    console.error("public-permit-details error:", error);
    return json({ error: "Lookup failed" }, 500);
  }
});
