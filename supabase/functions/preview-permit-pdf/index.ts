// preview-permit-pdf
//
// Renders a draft Work Permit PDF from raw wizard form data BEFORE the
// permit is submitted. No DB write, no permit_id required. Returns a
// data URL (base64) the frontend can hand straight to <iframe> or
// <embed>.
//
// Differences from generate-permit-pdf (which renders the final PDF
// from a saved permit row):
//   - No QR code (no permit number yet — placeholder shown instead)
//   - No signature blocks filled in (none exist yet)
//   - 'PREVIEW — NOT YET SUBMITTED' watermark across the top
//   - Workflow preview block at the bottom shows who WILL be asked
//     to approve, based on the selected work type's template
//
// Request body:
//   {
//     formData: {
//       requesterName, requesterEmail, contractorName, contactMobile,
//       unit, floor, workLocationName, workTypeName, workTypeId,
//       workDescription, workDateFrom, workDateTo, workTimeFrom,
//       workTimeTo, urgency, attachmentNames: string[]
//     }
//   }
//
// Response (200):
//   { success: true, pdfBase64: string, mimeType: 'application/pdf' }
//
// Auth: requires a valid user JWT (any authenticated user can generate
// a preview of their own form data — no sensitive data leaves their
// context). Rate limit: 20 previews per minute per user to prevent
// abuse.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";
import {
  loadArabicFont,
  drawArabic,
  arabicLabel,
} from "../_shared/pdf-bilingual.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Brand colors — match generate-permit-pdf
const BRAND_RED = rgb(0.804, 0.090, 0.098);  // #CD1719
const BRAND_DARK = rgb(0.114, 0.114, 0.106); // #1D1D1B
const BRAND_GREY = rgb(0.698, 0.698, 0.698); // #B2B2B2

// Rate limiting
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_PREVIEWS_PER_WINDOW = 20;
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(userId);
  if (!record || now > record.resetTime) {
    rateLimitStore.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  if (record.count >= MAX_PREVIEWS_PER_WINDOW) {
    return { allowed: false, retryAfter: Math.ceil((record.resetTime - now) / 1000) };
  }
  record.count++;
  return { allowed: true };
}

interface PreviewFormData {
  requesterName?: string;
  requesterEmail?: string;
  contractorName?: string;
  contactMobile?: string;
  unit?: string;
  floor?: string;
  workLocationName?: string;
  workTypeId?: string;
  workTypeName?: string;
  workDescription?: string;
  workDateFrom?: string;
  workDateTo?: string;
  workTimeFrom?: string;
  workTimeTo?: string;
  urgency?: "normal" | "urgent";
  attachmentNames?: string[];
}

interface WorkflowStepPreview {
  step_order: number;
  role_label: string;
}

// Small helpers — same drawing primitives as generate-permit-pdf
function drawText(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = BRAND_DARK) {
  if (!text) return;
  page.drawText(text, { x, y, size, font, color });
}

function drawBrandLine(page: PDFPage, y: number) {
  const { width } = page.getSize();
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 1, color: BRAND_RED });
}

function drawLabeledRow(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  labelFont: PDFFont,
  valueFont: PDFFont,
) {
  drawText(page, label, x, y, 9, labelFont, BRAND_GREY);
  drawText(page, value || "—", x, y - 13, 11, valueFont, BRAND_DARK);
  return y - 32;
}

// Look up the workflow steps for a given work_type_id so the preview
// can show "who will approve this". Falls back to empty array on any
// error — the preview still renders, just without the workflow block.
async function getWorkflowPreview(
  supabase: ReturnType<typeof createClient>,
  workTypeId: string | undefined,
): Promise<WorkflowStepPreview[]> {
  if (!workTypeId) return [];
  try {
    const { data: workType } = await supabase
      .from("work_types")
      .select("workflow_template_id")
      .eq("id", workTypeId)
      .single();

    if (!workType?.workflow_template_id) return [];

    const { data: steps } = await supabase
      .from("workflow_steps")
      .select("step_order, roles!inner(label)")
      .eq("workflow_template_id", workType.workflow_template_id)
      .order("step_order", { ascending: true });

    if (!steps) return [];

    return steps.map((s: any) => ({
      step_order: s.step_order,
      role_label: s.roles?.label || "Unknown role",
    }));
  } catch (err) {
    console.error("Workflow preview lookup failed:", err);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check — must be a signed-in user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Rate limit
    const rl = checkRateLimit(user.id);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ success: false, error: "Too many preview requests" }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(rl.retryAfter ?? 60),
          },
        },
      );
    }

    // Parse body
    const body = await req.json().catch(() => null);
    if (!body || typeof body.formData !== "object") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing formData" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fd: PreviewFormData = body.formData;

    // Service-role client for the workflow lookup (work_types + workflow_steps)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const workflowSteps = await getWorkflowPreview(supabaseAdmin, fd.workTypeId);

    // -----------------------------------------------------------
    // PDF rendering
    // -----------------------------------------------------------
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const arabicFonts = await loadArabicFont(pdfDoc).catch(() => null);

    const page = pdfDoc.addPage([595, 842]); // A4 portrait
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const margin = 40;
    let yPos = pageHeight - margin;

    // Preview watermark — diagonal bar at the top
    page.drawRectangle({
      x: 0,
      y: pageHeight - 60,
      width: pageWidth,
      height: 30,
      color: rgb(1, 0.95, 0.8),
    });
    drawText(
      page,
      "PREVIEW — NOT YET SUBMITTED",
      margin,
      pageHeight - 48,
      14,
      helveticaBold,
      rgb(0.65, 0.45, 0.05),
    );
    if (arabicFonts) {
      await drawArabic(
        page,
        "معاينة — لم يتم الإرسال بعد",
        pageWidth - margin,
        pageHeight - 48,
        { font: arabicFonts.bold, size: 14, color: rgb(0.65, 0.45, 0.05) },
      );
    }
    yPos = pageHeight - 90;

    // Title
    drawText(page, "WORK PERMIT", margin, yPos, 24, helveticaBold, BRAND_RED);
    if (arabicFonts) {
      await drawArabic(
        page,
        arabicLabel("WORK PERMIT") ?? "",
        pageWidth - margin,
        yPos,
        { font: arabicFonts.bold, size: 24, color: BRAND_RED },
      );
    }
    yPos -= 28;
    drawText(page, "WP-YYMMDD-NN  (number assigned on submission)", margin, yPos, 10, helvetica, BRAND_GREY);
    yPos -= 8;
    drawBrandLine(page, yPos);
    yPos -= 18;

    // Urgency badge
    const urgencyText = fd.urgency === "urgent" ? "URGENT (4-hour SLA)" : "Normal (48-hour SLA)";
    const urgencyColor = fd.urgency === "urgent" ? BRAND_RED : BRAND_DARK;
    drawText(page, "Priority: " + urgencyText, margin, yPos, 11, helveticaBold, urgencyColor);
    yPos -= 22;

    // ----- Requester section -----
    drawText(page, "REQUESTER", margin, yPos, 12, helveticaBold, BRAND_RED);
    yPos -= 16;
    yPos = drawLabeledRow(page, "Name", fd.requesterName || "—", margin, yPos, helvetica, helveticaBold);
    yPos = drawLabeledRow(page, "Email", fd.requesterEmail || "—", margin, yPos, helvetica, helveticaBold);
    yPos = drawLabeledRow(page, "Contractor / Company", fd.contractorName || "—", margin, yPos, helvetica, helveticaBold);
    yPos = drawLabeledRow(page, "Mobile", fd.contactMobile || "—", margin, yPos, helvetica, helveticaBold);

    yPos -= 6;

    // ----- Work location section -----
    drawText(page, "WORK LOCATION", margin, yPos, 12, helveticaBold, BRAND_RED);
    yPos -= 16;
    yPos = drawLabeledRow(page, "Unit / Floor", `${fd.unit || "—"} / ${fd.floor || "—"}`, margin, yPos, helvetica, helveticaBold);
    yPos = drawLabeledRow(page, "Location", fd.workLocationName || "—", margin, yPos, helvetica, helveticaBold);

    yPos -= 6;

    // ----- Work details section -----
    drawText(page, "WORK DETAILS", margin, yPos, 12, helveticaBold, BRAND_RED);
    yPos -= 16;
    yPos = drawLabeledRow(page, "Work Type", fd.workTypeName || "—", margin, yPos, helvetica, helveticaBold);

    // Description — multi-line wrap
    drawText(page, "Description", margin, yPos, 9, helvetica, BRAND_GREY);
    yPos -= 13;
    const description = fd.workDescription || "—";
    const wrapWidth = pageWidth - 2 * margin;
    const charsPerLine = Math.floor(wrapWidth / 5.5); // rough estimate
    const lines = wrapText(description, charsPerLine);
    for (const line of lines.slice(0, 5)) { // cap at 5 lines for preview
      drawText(page, line, margin, yPos, 11, helveticaBold, BRAND_DARK);
      yPos -= 14;
    }
    if (lines.length > 5) {
      drawText(page, `...(${lines.length - 5} more lines)`, margin, yPos, 9, helvetica, BRAND_GREY);
      yPos -= 14;
    }
    yPos -= 12;

    yPos = drawLabeledRow(
      page,
      "Dates",
      `${fd.workDateFrom || "—"}  →  ${fd.workDateTo || "—"}`,
      margin,
      yPos,
      helvetica,
      helveticaBold,
    );
    yPos = drawLabeledRow(
      page,
      "Times",
      `${fd.workTimeFrom || "—"}  →  ${fd.workTimeTo || "—"}`,
      margin,
      yPos,
      helvetica,
      helveticaBold,
    );

    yPos -= 6;

    // ----- Attachments section -----
    drawText(page, "ATTACHMENTS", margin, yPos, 12, helveticaBold, BRAND_RED);
    yPos -= 16;
    const names = fd.attachmentNames ?? [];
    if (names.length === 0) {
      drawText(page, "None attached", margin, yPos, 11, helvetica, BRAND_GREY);
      yPos -= 16;
    } else {
      for (const name of names.slice(0, 10)) {
        drawText(page, "• " + name, margin, yPos, 10, helvetica, BRAND_DARK);
        yPos -= 14;
      }
      if (names.length > 10) {
        drawText(page, `• ...(${names.length - 10} more)`, margin, yPos, 10, helvetica, BRAND_GREY);
        yPos -= 14;
      }
    }
    yPos -= 6;

    // ----- Approval workflow preview -----
    drawText(page, "APPROVAL WORKFLOW", margin, yPos, 12, helveticaBold, BRAND_RED);
    yPos -= 16;
    if (workflowSteps.length === 0) {
      drawText(
        page,
        "No workflow configured for this work type. The admin will need to assign one before this permit can move forward.",
        margin,
        yPos,
        10,
        helvetica,
        BRAND_GREY,
      );
      yPos -= 14;
    } else {
      drawText(
        page,
        `This request will move through ${workflowSteps.length} approval step${workflowSteps.length === 1 ? "" : "s"}:`,
        margin,
        yPos,
        10,
        helvetica,
        BRAND_DARK,
      );
      yPos -= 16;
      for (const step of workflowSteps) {
        drawText(
          page,
          `  ${step.step_order}.  ${step.role_label}`,
          margin,
          yPos,
          11,
          helvetica,
          BRAND_DARK,
        );
        yPos -= 16;
      }
    }

    // Footer
    const footerY = 30;
    drawBrandLine(page, footerY + 16);
    drawText(
      page,
      "This is a preview only. Submit the wizard to generate the official permit document.",
      margin,
      footerY,
      8,
      helvetica,
      BRAND_GREY,
    );

    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));

    return new Response(
      JSON.stringify({
        success: true,
        pdfBase64,
        mimeType: "application/pdf",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("preview-permit-pdf error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "internal_error",
        message: (err as Error).message,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// Naive word-wrap — good enough for the preview's description block.
// (The final generate-permit-pdf does font-metric-based wrapping; for
// the preview we don't need that fidelity.)
function wrapText(text: string, charsPerLine: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if (current.length + w.length + 1 <= charsPerLine) {
      current = current ? `${current} ${w}` : w;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}
