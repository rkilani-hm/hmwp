// =============================================================================
// email-permit-pdf
//
// Emails the APPROVED work permit PDF as an attachment. Mirror of
// email-gate-pass-pdf, adapted for work permits and for internal
// service-to-service use: it accepts the service-role key as bearer (so the
// approval function can call it) OR a valid user token, and takes a list of
// recipients (tenant + helpdesk) in one call.
//
// The PDF must already exist in the permit-pdfs bucket (the caller generates it
// first via generate-permit-pdf).
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getMicrosoftToken(): Promise<string> {
  const tenantId = Deno.env.get("MS_TENANT_ID");
  const clientId = Deno.env.get("MS_CLIENT_ID");
  const clientSecret = Deno.env.get("MS_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft 365 credentials not configured");
  }
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to get Microsoft token: ${response.status}`);
  }
  return (await response.json()).access_token;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth: service-role bearer (internal caller) OR a valid user token.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const token = authHeader.slice(7).trim();
    if (token !== serviceKey) {
      const supaUser = createClient(supabaseUrl, anonKey);
      const { data: { user }, error } = await supaUser.auth.getUser(token);
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    const { permitId, recipients } = await req.json();
    const to: string[] = Array.from(new Set(
      (Array.isArray(recipients) ? recipients : [])
        .filter((e: unknown): e is string => typeof e === "string" && e.trim() !== "")
        .map((e: string) => e.trim()),
    ));
    if (!permitId || to.length === 0) {
      return new Response(JSON.stringify({ error: "permitId and recipients are required" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: permit, error: permitError } = await admin
      .from("work_permits")
      .select("permit_no, pdf_url, requester_name, work_date_from, work_date_to")
      .eq("id", permitId)
      .single();
    if (permitError || !permit) {
      return new Response(JSON.stringify({ error: "Permit not found" }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const pdfFileName = permit.pdf_url || `${String(permit.permit_no).replace(/\//g, "-")}.pdf`;
    const { data: pdfData, error: pdfError } = await admin.storage
      .from("permit-pdfs")
      .download(pdfFileName);
    if (pdfError || !pdfData) {
      console.error("Permit PDF download error:", pdfError);
      return new Response(JSON.stringify({ error: "Permit PDF not found — generate it first." }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
    const pdfBase64 = uint8ArrayToBase64(pdfBytes);

    const logoUrl = `${supabaseUrl}/storage/v1/object/public/company-assets/company-logo.jpg`;
    const baseUrl = (Deno.env.get("HMWP_BASE_URL") || "https://www.hmwp.alhamra.com.kw").replace(/\/$/, "");

    const emailHtml = `
<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Work Permit ${permit.permit_no}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <tr><td style="padding:24px 40px;text-align:center;border-bottom:1px solid #e5e7eb;"><img src="${logoUrl}" alt="Al Hamra" style="max-height:60px;max-width:200px;"/></td></tr>
      <tr><td style="background:#16a34a;padding:20px 40px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">Work Permit Approved</h1>
        <p style="margin:6px 0 0;color:#dcfce7;font-size:14px;">${permit.permit_no}</p>
      </td></tr>
      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">
          Work permit <strong>${permit.permit_no}</strong> has been fully approved. The approved permit PDF —
          including all details and approval signatures — is <strong>attached to this email</strong>.
        </p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#6b7280;">
          Please present the attached document (or its QR code) at the security checkpoint.
        </p>
        <div style="text-align:center;margin-top:24px;">
          <a href="${baseUrl}/permits/${permitId}" style="display:inline-block;padding:13px 32px;background:#CD1719;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">View Permit Online</a>
        </div>
      </td></tr>
      <tr><td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;line-height:1.6;">
          This is an automated notification from the Al Hamra Work Permit System.<br>Please do not reply to this email.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

    const accessToken = await getMicrosoftToken();
    const fromEmail = Deno.env.get("MS_SENDER_EMAIL") || "permits@alhamra.com.kw";

    const emailPayload = {
      message: {
        subject: `Work Permit Approved: ${permit.permit_no}`,
        body: { contentType: "HTML", content: emailHtml },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
        attachments: [{
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: `${String(permit.permit_no).replace(/\//g, "-")}.pdf`,
          contentType: "application/pdf",
          contentBytes: pdfBase64,
        }],
      },
      saveToSentItems: false,
    };

    const startedAt = Date.now();
    const emailResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${fromEmail}/sendMail`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(emailPayload) },
    );
    const durationMs = Date.now() - startedAt;
    const subjectLine = `Work Permit Approved: ${permit.permit_no}`;
    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Email send error:", errorText);
      try {
        const { error: logErr } = await admin.from("email_delivery_logs").insert({
          notification_type: "approved_pdf",
          recipients: to,
          recipient_count: to.length,
          subject: subjectLine,
          permit_id: permitId,
          permit_no: permit.permit_no,
          status: "failed",
          error_message: errorText.slice(0, 2000),
          provider: "microsoft_graph",
          duration_ms: durationMs,
          has_attachment: true,
        });
        if (logErr) console.error("email_delivery_logs insert (failed) error:", logErr);
      } catch (e) { console.error("email_delivery_logs insert (failed) threw:", e); }
      throw new Error(`Failed to send email: ${emailResponse.status}`);
    }
    try {
      const { error: logErr } = await admin.from("email_delivery_logs").insert({
        notification_type: "approved_pdf",
        recipients: to,
        recipient_count: to.length,
        subject: subjectLine,
        permit_id: permitId,
        permit_no: permit.permit_no,
        status: "sent",
        error_message: null,
        provider: "microsoft_graph",
        duration_ms: durationMs,
        has_attachment: true,
      });
      if (logErr) console.error("email_delivery_logs insert (sent) error:", logErr);
    } catch (e) { console.error("email_delivery_logs insert (sent) threw:", e); }

    // Best-effort audit line on the permit's activity log.
    try {
      await admin.from("activity_logs").insert({
        permit_id: permitId,
        action: "Approved Permit Emailed",
        performed_by: "System",
        details: `Approved permit PDF emailed to: ${to.join(", ")}`,
      });
    } catch (_) { /* non-fatal */ }

    return new Response(
      JSON.stringify({ success: true, message: `Permit PDF emailed to ${to.length} recipient(s)` }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("Error emailing permit PDF:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
