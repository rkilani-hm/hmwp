// Public permit submission endpoint.
// Verifies Cloudflare Turnstile, enforces per-IP rate limiting, then
// inserts the permit using the service role. This replaces the direct
// anon-key client insert that was previously done in useCreatePublicPermit.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY");

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MIN = 60;

interface Payload {
  external_company_name: string;
  external_contact_person: string;
  contact_mobile: string;
  requester_email: string;
  unit: string;
  floor: string;
  work_location: string;
  work_location_id?: string | null;
  work_location_other?: string | null;
  work_type_id: string;
  work_description: string;
  work_date_from: string;
  work_date_to: string;
  work_time_from: string;
  work_time_to: string;
  urgency?: "normal" | "urgent";
  turnstileToken: string;
}

function getClientIp(req: Request): string {
  const cf = req.headers.get("CF-Connecting-IP");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) {
    console.error("TURNSTILE_SECRET_KEY is not set");
    return false;
  }
  const body = new URLSearchParams({
    secret: TURNSTILE_SECRET_KEY,
    response: token,
    remoteip: ip,
  });
  const resp = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const json = await resp.json().catch(() => ({}));
  if (!json.success) {
    console.warn("Turnstile verify failed:", json);
  }
  return !!json.success;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const REQUIRED_FIELDS: (keyof Payload)[] = [
  "external_company_name",
  "external_contact_person",
  "contact_mobile",
  "requester_email",
  "unit",
  "floor",
  "work_location",
  "work_type_id",
  "work_description",
  "work_date_from",
  "work_date_to",
  "work_time_from",
  "work_time_to",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Validate required fields
  for (const f of REQUIRED_FIELDS) {
    const v = (payload as any)[f];
    if (typeof v !== "string" || v.trim() === "") {
      return jsonResponse({ error: `Missing required field: ${f}` }, 400);
    }
  }
  if (!payload.turnstileToken) {
    return jsonResponse({ error: "Missing CAPTCHA token" }, 400);
  }

  const ip = getClientIp(req);

  // STEP A — Turnstile
  const ok = await verifyTurnstile(payload.turnstileToken, ip);
  if (!ok) {
    return jsonResponse(
      { error: "CAPTCHA verification failed. Please refresh and try again." },
      403,
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // STEP B — Rate limit
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60 * 1000)
    .toISOString();
  const { count, error: countErr } = await admin
    .from("public_submission_log")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);

  if (countErr) {
    console.error("Rate-limit count error:", countErr);
    return jsonResponse({ error: "Internal error" }, 500);
  }
  if ((count ?? 0) >= RATE_LIMIT_MAX) {
    return jsonResponse(
      { error: "Too many requests, please try again later." },
      429,
    );
  }

  // STEP C — Allocate permit number and insert
  const { data: rpcPermitNo, error: rpcErr } = await admin.rpc(
    "next_permit_number_today",
  );
  if (rpcErr || !rpcPermitNo) {
    console.error("Permit number RPC failed:", rpcErr);
    return jsonResponse({ error: "Failed to allocate permit number" }, 500);
  }
  const permitNo = rpcPermitNo as string;

  const urgency = payload.urgency === "urgent" ? "urgent" : "normal";
  const hoursToAdd = urgency === "urgent" ? 4 : 48;
  const slaDeadline = new Date(Date.now() + hoursToAdd * 60 * 60 * 1000)
    .toISOString();

  const { data: permit, error: insertErr } = await admin
    .from("work_permits")
    .insert({
      permit_no: permitNo,
      requester_id: null,
      requester_name: payload.external_contact_person,
      requester_email: payload.requester_email,
      contractor_name: payload.external_company_name,
      external_company_name: payload.external_company_name,
      external_contact_person: payload.external_contact_person,
      contact_mobile: payload.contact_mobile,
      unit: payload.unit,
      floor: payload.floor,
      work_location: payload.work_location,
      work_location_id: payload.work_location_id || null,
      work_location_other: payload.work_location_other || null,
      work_type_id: payload.work_type_id,
      work_description: payload.work_description,
      work_date_from: payload.work_date_from,
      work_date_to: payload.work_date_to,
      work_time_from: payload.work_time_from,
      work_time_to: payload.work_time_to,
      status: "submitted",
      urgency,
      sla_deadline: slaDeadline,
      is_internal: true,
    })
    .select()
    .single();

  if (insertErr || !permit) {
    console.error("Permit insert failed:", insertErr);
    return jsonResponse(
      { error: insertErr?.message || "Failed to create permit" },
      500,
    );
  }

  // Log this submission for rate limiting
  await admin.from("public_submission_log").insert({ ip });

  // Fire-and-forget email notifications (non-fatal)
  try {
    // Helpdesk emails
    const { data: helpdeskPayload } = await admin.rpc(
      "get_emails_for_role" as any,
      { p_role_name: "helpdesk" },
    );
    const helpdeskEmails: string[] =
      (helpdeskPayload as any)?.emails ?? [];

    if (helpdeskEmails.length > 0) {
      admin.functions.invoke("send-email-notification", {
        body: {
          to: helpdeskEmails,
          notificationType: "new_permit",
          subject: `New INTERNAL ${
            urgency === "urgent" ? "URGENT " : ""
          }Work Permit: ${permitNo}`,
          permitNo,
          permitId: permit.id,
          details: {
            permitId: permit.id,
            workType: payload.work_description,
            requesterName: `${payload.external_contact_person} (${payload.external_company_name})`,
            urgency,
            isInternal: true,
          },
        },
      }).catch((e) =>
        console.error("Helpdesk email invoke failed:", e)
      );
    }

    // Requester confirmation
    admin.functions.invoke("send-email-notification", {
      body: {
        to: [payload.requester_email],
        notificationType: "permit_submitted",
        subject: `Work Permit Request Received: ${permitNo}`,
        permitNo,
        permitId: permit.id,
        details: {
          permitId: permit.id,
          workDescription: payload.work_description,
          workLocation: payload.work_location,
          workDates: `${payload.work_date_from} to ${payload.work_date_to}`,
        },
      },
    }).catch((e) => console.error("Requester email invoke failed:", e));
  } catch (e) {
    console.error("Email dispatch error (non-fatal):", e);
  }

  return jsonResponse({ permitNo, id: permit.id, permit_no: permitNo }, 200);
});
