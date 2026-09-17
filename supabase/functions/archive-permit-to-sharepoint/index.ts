// =============================================================================
// archive-permit-to-sharepoint
//
// Uploads the APPROVED work-permit PDF to a configurable SharePoint document
// library via Microsoft Graph (same M365 app credentials as the email
// pipeline). Called automatically on final approval (from
// verify-signature-approval) and by the admin "Test connection" button.
//
// Prerequisite: the M365 app registration must have the Graph application
// permission **Sites.ReadWrite.All** (admin-consented). The existing mail
// scopes are not sufficient for SharePoint upload.
//
// Body: { permitId?: string, test?: boolean }
//   - test: validates config by uploading + deleting a tiny marker file.
//   - permitId: archives that permit's approved PDF.
// Auth: service-role bearer, an admin user, or the x-reminder-secret header.
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-reminder-secret",
};
const GRAPH = "https://graph.microsoft.com/v1.0";

async function graphToken(): Promise<string> {
  const t = Deno.env.get("MS_TENANT_ID"), c = Deno.env.get("MS_CLIENT_ID"), s = Deno.env.get("MS_CLIENT_SECRET");
  if (!t || !c || !s) throw new Error("Microsoft 365 credentials not configured");
  const r = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c, client_secret: s, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  if (!r.ok) throw new Error(`Graph token failed: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

// Resolve the SharePoint site id + target drive id from the saved settings.
async function resolveDrive(tok: string, s: any): Promise<{ driveId: string; driveName: string }> {
  if (!s.site_hostname) throw new Error("SharePoint site hostname is not set");
  const hp = s.site_hostname.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const sp = (s.site_path || "").trim().replace(/^\/+/, "");
  const siteUrl = sp ? `${GRAPH}/sites/${hp}:/${sp}?$select=id,displayName`
                     : `${GRAPH}/sites/${hp}?$select=id,displayName`;
  const siteRes = await fetch(siteUrl, { headers: { Authorization: `Bearer ${tok}` } });
  if (!siteRes.ok) throw new Error(`Site not found (${siteRes.status}). Check hostname/path. ${await siteRes.text()}`);
  const siteId = (await siteRes.json()).id;

  const drRes = await fetch(`${GRAPH}/sites/${siteId}/drives?$select=id,name`, { headers: { Authorization: `Bearer ${tok}` } });
  if (!drRes.ok) throw new Error(`Could not list document libraries (${drRes.status}). ${await drRes.text()}`);
  const drives = (await drRes.json()).value || [];
  if (drives.length === 0) throw new Error("No document libraries found on the site");
  const wanted = (s.library_name || "").trim().toLowerCase();
  const drive = wanted ? drives.find((d: any) => (d.name || "").toLowerCase() === wanted) : drives[0];
  if (!drive) throw new Error(`Document library "${s.library_name}" not found on the site`);
  return { driveId: drive.id, driveName: drive.name };
}

function resolvePlaceholders(tpl: string, ctx: Record<string, string>): string {
  return (tpl || "").replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? `{${k}}`);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, st = 200) =>
    new Response(JSON.stringify(b), { status: st, headers: { "Content-Type": "application/json", ...corsHeaders } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // ---- Auth: cron-secret OR service key OR admin user ----
    const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
    const providedSecret = req.headers.get("x-reminder-secret");
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    let authorized = false;
    if (cronSecret && providedSecret && providedSecret === cronSecret) authorized = true;
    else if (token && token === serviceKey) authorized = true;
    else if (token) {
      const { data: { user } } = await createClient(supabaseUrl, anonKey).auth.getUser(token);
      if (user) {
        const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (isAdmin) authorized = true;
      }
    }
    if (!authorized) return json({ error: "Unauthorized" }, 401);

    const { permitId, test } = await req.json().catch(() => ({}));

    const { data: s } = await admin.from("sharepoint_settings").select("*").eq("id", true).maybeSingle();
    if (!s) return json({ error: "SharePoint settings not initialised" }, 500);

    // ---- Test connection: upload + delete a marker to prove write access ----
    if (test) {
      try {
        const tok = await graphToken();
        const { driveId, driveName } = await resolveDrive(tok, s);
        const now = new Date();
        const folder = resolvePlaceholders(s.folder_path || "", dateCtx(now, s.timezone, "connection-test", "test"));
        const path = [folder, "_hmwp_connection_test.txt"].filter(Boolean).join("/").replace(/^\/+/, "");
        const up = await fetch(`${GRAPH}/drives/${driveId}/root:/${encodeURI(path)}:/content`, {
          method: "PUT", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "text/plain" },
          body: `Al Hamra WPS connection test ${now.toISOString()}`,
        });
        if (!up.ok) throw new Error(`Write failed (${up.status}). ${await up.text()}`);
        const item = await up.json();
        // clean up the marker
        await fetch(`${GRAPH}/drives/${driveId}/items/${item.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}` } }).catch(() => {});
        const msg = `OK — connected to "${driveName}", folder "${folder || "(root)"}" is writable.`;
        await admin.from("sharepoint_settings").update({ last_test_at: now.toISOString(), last_test_ok: true, last_test_message: msg }).eq("id", true);
        return json({ success: true, message: msg });
      } catch (e: any) {
        const msg = String(e?.message || e).slice(0, 800);
        await admin.from("sharepoint_settings").update({ last_test_at: new Date().toISOString(), last_test_ok: false, last_test_message: msg }).eq("id", true);
        return json({ success: false, error: msg }, 200);
      }
    }

    // ---- Real archive ----
    if (!permitId) return json({ error: "permitId is required" }, 400);
    const { data: permit } = await admin.from("work_permits")
      .select("permit_no, pdf_url, status, work_types(name)").eq("id", permitId).maybeSingle();
    if (!permit) return json({ error: "Permit not found" }, 404);

    if (!s.enabled) {
      await logUpload(admin, permitId, permit.permit_no, "skipped", null, null, "SharePoint archiving is disabled");
      return json({ success: false, skipped: true, message: "SharePoint archiving is disabled" });
    }
    if (permit.status !== "approved") {
      await logUpload(admin, permitId, permit.permit_no, "skipped", null, null, `Permit not fully approved (status: ${permit.status})`);
      return json({ success: false, skipped: true, message: "Permit is not fully approved" });
    }

    // Download the approved PDF from storage (generated by generate-permit-pdf).
    const pdfName = permit.pdf_url || `${String(permit.permit_no).replace(/\//g, "-")}.pdf`;
    const { data: pdfData, error: pdfErr } = await admin.storage.from("permit-pdfs").download(pdfName);
    if (pdfErr || !pdfData) {
      await logUpload(admin, permitId, permit.permit_no, "failed", null, null, "Approved PDF not found in storage");
      return json({ error: "Approved PDF not found — generate it first" }, 404);
    }
    const bytes = new Uint8Array(await pdfData.arrayBuffer());

    try {
      const tok = await graphToken();
      const { driveId } = await resolveDrive(tok, s);
      const ctx = dateCtx(new Date(), s.timezone, String(permit.permit_no), (permit as any).work_types?.name || "");
      const folder = resolvePlaceholders(s.folder_path || "", ctx);
      const filename = resolvePlaceholders(s.filename_template || "{permit_no}.pdf", ctx).replace(/\//g, "-");
      const path = [folder, filename].filter(Boolean).join("/").replace(/^\/+/, "");
      // Simple upload (permit PDFs are well under the 4 MB simple-upload limit);
      // Graph auto-creates any missing parent folders.
      const up = await fetch(`${GRAPH}/drives/${driveId}/root:/${encodeURI(path)}:/content`, {
        method: "PUT", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/pdf" }, body: bytes,
      });
      if (!up.ok) throw new Error(`Upload failed (${up.status}). ${(await up.text()).slice(0, 500)}`);
      const item = await up.json();
      await logUpload(admin, permitId, permit.permit_no, "uploaded", item.webUrl || null, folder, null);
      try {
        await admin.from("activity_logs").insert({
          permit_id: permitId, action: "Archived to SharePoint", performed_by: "System",
          details: `Approved PDF uploaded to SharePoint: ${folder}/${filename}`,
        });
      } catch (_) { /* non-fatal */ }
      return json({ success: true, webUrl: item.webUrl, path });
    } catch (e: any) {
      const msg = String(e?.message || e).slice(0, 800);
      await logUpload(admin, permitId, permit.permit_no, "failed", null, null, msg);
      return json({ error: msg }, 502);
    }
  } catch (error: any) {
    console.error("archive-permit-to-sharepoint error:", error);
    return json({ error: String(error?.message || error) }, 500);
  }
});

function pad(n: number) { return String(n).padStart(2, "0"); }
// Build placeholder context using the configured timezone (Kuwait = UTC+3, no DST).
function dateCtx(d: Date, tz: string, permitNo: string, workType: string): Record<string, string> {
  const offsetMin = tz === "Asia/Kuwait" ? 180 : 0;
  const local = new Date(d.getTime() + offsetMin * 60000);
  const yyyy = String(local.getUTCFullYear()), MM = pad(local.getUTCMonth() + 1), dd = pad(local.getUTCDate());
  return { permit_no: permitNo.replace(/\//g, "-"), work_type: workType || "General",
           yyyy, MM, dd, date: `${yyyy}-${MM}-${dd}` };
}

async function logUpload(admin: any, permitId: string, permitNo: string, status: string, webUrl: string | null, folder: string | null, err: string | null) {
  try {
    await admin.from("sharepoint_uploads").insert({
      permit_id: permitId, permit_no: permitNo, status, web_url: webUrl, folder_path: folder, error_message: err,
    });
  } catch (e) { console.error("sharepoint_uploads log failed:", e); }
}
