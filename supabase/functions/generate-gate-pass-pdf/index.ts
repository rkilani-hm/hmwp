import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import qrcode from "https://esm.sh/qrcode-generator@1.4.4";
import {
  loadArabicFont,
  drawArabic,
  arabicLabel,
} from "../_shared/pdf-bilingual.ts";
import {
  BRAND_RED,
  BRAND_DARK,
  createPdfLayout,
  drawApprovalChain,
  type ApprovalRow,
} from "../_shared/pdf-layout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 10;
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(userId);
  if (!record || now > record.resetTime) {
    rateLimitStore.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  if (record.count >= MAX_PER_WINDOW) {
    return { allowed: false, retryAfter: Math.ceil((record.resetTime - now) / 1000) };
  }
  record.count++;
  return { allowed: true };
}

const categoryLabels: Record<string, string> = {
  detailed_material_pass: "Detailed Material Pass",
  generic_delivery_permit: "Generic Delivery Permit",
};

const typeLabels: Record<string, string> = {
  material_out: "Material Out",
  material_in: "Material In",
  asset_transfer: "Asset Transfer",
  scrap_disposal: "Scrap Disposal",
  contractor_tools: "Contractor Tools",
  internal_shifting: "Internal Shifting",
};

const shiftingLabels: Record<string, string> = {
  manually: "Manually",
  material_trolley: "Material Trolley",
  pallet_trolley: "Pallet Trolley",
  forklift: "Forklift",
};

const deliveryLabels: Record<string, string> = {
  goods: "Goods",
  food: "Food",
  materials: "Materials",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized - Invalid token" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const rl = checkRateLimit(user.id);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests. Please wait." }), {
        status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfter), ...corsHeaders },
      });
    }

    const { gatePassId } = await req.json();
    if (!gatePassId) {
      return new Response(JSON.stringify({ error: "Gate pass ID is required" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch gate pass
    const { data: gp, error: gpError } = await supabaseAdmin
      .from("gate_passes")
      .select("*")
      .eq("id", gatePassId)
      .single();

    if (gpError || !gp) {
      return new Response(JSON.stringify({ error: "Gate pass not found" }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch items
    const { data: items } = await supabaseAdmin
      .from("gate_pass_items")
      .select("*")
      .eq("gate_pass_id", gatePassId)
      .order("serial_number", { ascending: true });

    // Auth check — requester, OR any internal (non-tenant) staff member.
    // Parity with the Work Permit PDF: is_gate_pass_approver only recognizes
    // roles wired into a gate-pass workflow, so staff with a valid internal role
    // (e.g. bdcr_manager) were wrongly denied. is_non_tenant_staff matches who can
    // legitimately handle internal documents; tenant-only users remain blocked.
    const isRequester = gp.requester_id === user.id;
    const { data: isApproverResult } = await supabaseAdmin.rpc("is_gate_pass_approver", { _user_id: user.id });
    const { data: isAdminResult } = await supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: isStaffResult } = await supabaseAdmin.rpc("is_non_tenant_staff", { p_user: user.id });
    if (!isRequester && !isApproverResult && !isAdminResult && !isStaffResult) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Generating gate pass PDF:", gp.pass_no);

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Phase 4b: Arabic font for bilingual labels. On failure (network,
    // invalid font, library missing) we fall back to English-only — parity
    // with the WP generator — rather than crashing the whole PDF.
    const arabicFonts = await loadArabicFont(pdfDoc);
    if (!arabicFonts) {
      console.warn("[generate-gate-pass-pdf] ARABIC FONT UNAVAILABLE — rendering English-only.");
    }

    // A4 page size to match the Work Permit design system.
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 22;

    const createPage = () => {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      return { page, yPos: pageHeight - margin };
    };

    // ---- Brand design system (shared) -------------------------------------
    // Brand constants + the section/subsection/field/doc-id-strip helpers
    // live in ../_shared/pdf-layout.ts so the Work Permit and Gate Pass PDFs
    // share one source of truth and cannot visually drift.
    const layout = createPdfLayout({
      pdfDoc, pageWidth, pageHeight, margin, helvetica, helveticaBold, arabicFonts,
    });
    const {
      drawText,
      drawBrandLine,
      drawSectionHeader,
      drawSubsectionHeader,
      drawField,
      drawDocIdStrip,
    } = layout;

    const pad2 = (n: number) => n.toString().padStart(2, '0');
    const formatDate = (date: string | null | undefined) => {
      if (!date) return 'N/A';
      const d = new Date(date);
      if (isNaN(d.getTime())) return 'N/A';
      return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    };
    const formatDateTime = (date: string | null | undefined) => {
      if (!date) return 'N/A';
      const d = new Date(date);
      if (isNaN(d.getTime())) return 'N/A';
      return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    };

    // Load company logo (parity with WP; render without it if missing).
    let companyLogo: any = null;
    try {
      const { data: logoData, error: logoError } = await supabaseAdmin.storage.from("company-assets").download("company-logo.jpg");
      if (!logoError && logoData) {
        companyLogo = await pdfDoc.embedJpg(new Uint8Array(await logoData.arrayBuffer()));
      } else {
        const { data: pngData, error: pngError } = await supabaseAdmin.storage.from("company-assets").download("company-logo.png");
        if (!pngError && pngData) {
          companyLogo = await pdfDoc.embedPng(new Uint8Array(await pngData.arrayBuffer()));
        }
      }
    } catch (e) {
      console.error("Logo load error:", e);
    }

    // QR code — points to the GP verification URL via HMWP_BASE_URL.
    let qrCode: any = null;
    try {
      const passNo = String(gp.pass_no || "").trim();
      if (passNo) {
        qrCode = qrcode(0, "M");
        // Env-driven; was hardcoded to the old hmwp.lovable.app domain.
        const gpBaseUrl = Deno.env.get("HMWP_BASE_URL") || "https://www.hmwp.alhamra.com.kw";
        qrCode.addData(`${gpBaseUrl}/gate-passes/${gp.id}`);
        qrCode.make();
      }
    } catch (e) {
      console.error("QR error:", e);
    }

    // ===== PAGE 1: Gate Pass Details =====
    let { page, yPos } = createPage();

    // ---- Top-right chrome: company logo (parity with WP) ----
    const chromeTopY = yPos;
    let chromeBottomY = chromeTopY;
    if (companyLogo) {
      const maxLogoHeight = 40;
      const maxLogoWidth = 100;
      const logoScale = Math.min(maxLogoWidth / companyLogo.width, maxLogoHeight / companyLogo.height, 1);
      const logoWidth = companyLogo.width * logoScale;
      const logoHeight = companyLogo.height * logoScale;
      page.drawImage(companyLogo, {
        x: pageWidth - margin - logoWidth,
        y: chromeTopY - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
      chromeBottomY = chromeTopY - logoHeight;
    }

    // ---- Bilingual title block (left column) ----
    // Single fixed title for ALL gate pass types/categories (not derived from
    // the category), per product decision.
    const titleEn = "Generic Gate Pass";
    const titleAr = "تصريح دخول/خروج عام";
    if (arabicFonts) {
      await drawArabic(page, titleAr, margin + 180, yPos, {
        font: arabicFonts.bold,
        size: 26,
        color: BRAND_DARK,
      });
    }
    yPos -= 26;
    drawText(page, titleEn, margin, yPos, 20, helveticaBold, BRAND_DARK);
    yPos -= 18;
    drawText(page, gp.pass_no || '', margin, yPos, 14, helveticaBold, BRAND_RED);
    yPos -= 8;
    drawBrandLine(page, yPos);
    yPos -= 16;

    // Don't let the doc-ID strip collide with the right-column logo.
    if (yPos > chromeBottomY) yPos = chromeBottomY;
    yPos -= 8;

    // ---- Doc-ID strip (Gate Pass No. / Pass Type / Date / Issued) ----
    const passTypeLabel = typeLabels[gp.pass_type] || gp.pass_type || '—';
    await drawDocIdStrip(page, yPos, [
      { labelEn: 'Gate Pass No.', value: gp.pass_no || '—' },
      { labelEn: 'Pass Type',     value: passTypeLabel },
      { labelEn: 'Date',          value: formatDate(gp.valid_from) },
      { labelEn: 'Issued',        value: formatDate(gp.created_at) },
    ]);
    yPos -= 50;

    // Status badge.
    const statusText = (gp.status || "unknown").toUpperCase().replace(/_/g, " ");
    const statusColor = gp.status === "approved" || gp.status === "completed" ? rgb(0.13, 0.77, 0.37)
      : gp.status === "rejected" ? BRAND_RED : rgb(0.42, 0.45, 0.5);
    drawText(page, "Status: " + statusText, margin, yPos, 9, helveticaBold, statusColor);
    yPos -= 18;

    const contentW = pageWidth - margin * 2;
    const gridGap = 12;
    const col3W = (contentW - gridGap * 2) / 3;
    const c1x = margin;
    const c2x = margin + col3W + gridGap;
    const c3x = margin + (col3W + gridGap) * 2;
    const halfW2 = (contentW - gridGap) / 2;

    // ====================================================================
    // SECTION A — GATE PASS DETAILS
    // ====================================================================
    await drawSectionHeader(page, 'SECTION A — PERMIT DETAILS', yPos, 11);
    yPos -= 26;

    // ---- Subsection 1: Pass Type ----
    await drawSubsectionHeader(page, '1. Pass Type', yPos, 10);
    yPos -= 22;
    const categoryDisplay = categoryLabels[gp.pass_category] || gp.pass_category || 'N/A';
    await drawField(page, { labelEn: 'Type',     value: passTypeLabel,                                                 x: c1x, y: yPos, width: col3W });
    await drawField(page, { labelEn: 'Category', value: categoryDisplay,                                               x: c2x, y: yPos, width: col3W });
    await drawField(page, { labelEn: 'Delivery', value: gp.delivery_type ? (deliveryLabels[gp.delivery_type] || gp.delivery_type) : 'N/A', x: c3x, y: yPos, width: col3W });
    yPos -= 32;

    // ---- Subsection 2: Requestor Information ----
    await drawSubsectionHeader(page, '2. Requestor Details', yPos, 10);
    yPos -= 22;
    await drawField(page, { labelEn: 'Name',  value: gp.requester_name  || 'N/A', x: c1x,                    y: yPos, width: halfW2 });
    await drawField(page, { labelEn: 'Email', value: gp.requester_email || 'N/A', x: c1x + halfW2 + gridGap, y: yPos, width: halfW2 });
    yPos -= 32;
    await drawField(page, { labelEn: 'Unit',          value: gp.unit_floor     || 'N/A', x: c1x, y: yPos, width: col3W });
    await drawField(page, { labelEn: 'Location',      value: gp.delivery_area  || 'N/A', x: c2x, y: yPos, width: col3W });
    await drawField(page, { labelEn: 'Client',        value: gp.client_contractor_name || 'N/A', x: c3x, y: yPos, width: col3W });
    yPos -= 32;
    if (gp.client_rep_name || gp.client_rep_contact) {
      await drawField(page, { labelEn: 'Client Rep', value: gp.client_rep_name    || 'N/A', x: c1x,                    y: yPos, width: halfW2 });
      await drawField(page, { labelEn: 'Contact',    value: gp.client_rep_contact || 'N/A', x: c1x + halfW2 + gridGap, y: yPos, width: halfW2 });
      yPos -= 32;
    }
    if (gp.vehicle_make_model || gp.vehicle_license_plate) {
      const vehicleVal = (gp.vehicle_make_model || '') + (gp.vehicle_license_plate ? ` (${gp.vehicle_license_plate})` : '');
      await drawField(page, { labelEn: 'Vehicle', value: vehicleVal || 'N/A', x: c1x, y: yPos, width: contentW });
      yPos -= 32;
    }

    // ---- Subsection 3: Transfer Schedule ----
    await drawSubsectionHeader(page, '3. Transfer Schedule', yPos, 10);
    yPos -= 22;
    const dateValue = `${formatDate(gp.valid_from)}  -  ${formatDate(gp.valid_to)}`;
    const timeValue = `${gp.time_from || 'N/A'}  -  ${gp.time_to || 'N/A'}`;
    const halfW = (contentW - gridGap) / 2;
    await drawField(page, { labelEn: 'Date', value: dateValue, x: c1x,                   y: yPos, width: halfW });
    await drawField(page, { labelEn: 'Time', value: timeValue, x: c1x + halfW + gridGap, y: yPos, width: halfW });
    yPos -= 32;
    await drawField(page, {
      labelEn: 'Shifting Method',
      value: gp.shifting_method ? (shiftingLabels[gp.shifting_method] || gp.shifting_method) : 'N/A',
      x: c1x, y: yPos, width: contentW,
    });
    yPos -= 36;

    // ---- Subsection 4: Item Details (table) ----
    const passItems = items || [];
    if (passItems.length > 0) {
      await drawSubsectionHeader(page, '4. Item Details', yPos, 10);
      yPos -= 20;

      const tableLeft = margin;
      const colWidths = [32, 230, 55, 60, contentW - 32 - 230 - 55 - 60]; // SR, Details, Qty, High Val, Remarks
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);

      // Header row
      page.drawRectangle({ x: tableLeft, y: yPos - 15, width: tableWidth, height: 18, color: rgb(0.93, 0.93, 0.93) });
      let xOff = tableLeft + 4;
      const headers = ["SR", "Details of Item", "Qty", "High Val", "Remarks"];
      for (let h = 0; h < headers.length; h++) {
        drawText(page, headers[h], xOff, yPos - 11, 8, helveticaBold, BRAND_DARK);
        xOff += colWidths[h];
      }
      yPos -= 18;

      for (const item of passItems) {
        if (yPos < 110) {
          const np = createPage();
          page = np.page;
          yPos = np.yPos;
          await drawSubsectionHeader(page, '4. Item Details (continued)', yPos, 10);
          yPos -= 20;
        }

        page.drawRectangle({
          x: tableLeft, y: yPos - 15, width: tableWidth, height: 18,
          borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5,
        });

        xOff = tableLeft + 4;
        drawText(page, String(item.serial_number ?? ''), xOff, yPos - 11, 8, helvetica, BRAND_DARK);
        xOff += colWidths[0];

        const details = String(item.item_details || "").substring(0, 48);
        drawText(page, details, xOff, yPos - 11, 8, helvetica, BRAND_DARK);
        xOff += colWidths[1];

        drawText(page, String(item.quantity || "1"), xOff, yPos - 11, 8, helvetica, BRAND_DARK);
        xOff += colWidths[2];

        drawText(page, item.is_high_value ? "Yes" : "No", xOff, yPos - 11, 8, helvetica,
          item.is_high_value ? BRAND_RED : rgb(0.3, 0.3, 0.3));
        xOff += colWidths[3];

        const remarks = String(item.remarks || "-").substring(0, 34);
        drawText(page, remarks, xOff, yPos - 11, 8, helvetica, BRAND_DARK);

        yPos -= 18;
      }
      yPos -= 14;
    }

    // ---- Subsection 5: Purpose of Material Shifting ----
    if (gp.purpose) {
      if (yPos < 140) {
        const np = createPage();
        page = np.page;
        yPos = np.yPos;
      }
      await drawSubsectionHeader(page, '5. Purpose of Material Shifting', yPos, 10);
      yPos -= 18;
      const purposeText = String(gp.purpose).substring(0, 600);
      const words = purposeText.split(" ");
      let line = "";
      for (const word of words) {
        const test = line + word + " ";
        if (test.length > 95) {
          drawText(page, line.trim(), margin, yPos, 9, helvetica, BRAND_DARK);
          yPos -= 13;
          line = word + " ";
        } else {
          line = test;
        }
      }
      if (line.trim()) {
        drawText(page, line.trim(), margin, yPos, 9, helvetica, BRAND_DARK);
        yPos -= 13;
      }
      yPos -= 10;
    }

    // Forklift warning (restyled, brand red).
    if (gp.shifting_method === "forklift") {
      if (yPos < 80) {
        const np = createPage();
        page = np.page;
        yPos = np.yPos;
      }
      drawText(page, "NOTE: Materials shifting using forklift in Al Hamra premises shall obtain a valid Work Permit.", margin, yPos, 8, helveticaBold, BRAND_RED);
      yPos -= 16;
    }

    // CCTV confirmation (restyled).
    if (gp.security_cctv_confirmed) {
      drawText(page, "CCTV Monitoring Confirmed", margin, yPos, 9, helveticaBold, rgb(0.13, 0.77, 0.37));
      yPos -= 16;
    }

    yPos -= 6;

    // ====================================================================
    // SECTION B — APPROVAL CHAIN  (sourced from gate_pass_approvals)
    // ====================================================================
    if (yPos < 120) {
      const np = createPage();
      page = np.page;
      yPos = np.yPos;
    }
    await drawSectionHeader(page, 'SECTION B — APPROVAL CHAIN', yPos, 11);
    yPos -= 26;

    // ---- Gate-pass role display-name maps (EN + AR) ----
    // Mirrors the WP ROLE_DISPLAY_NAMES / ROLE_DISPLAY_NAMES_AR / render order,
    // using the actual gate_pass_approvals role keys (see verify-gate-pass-approval
    // roleColumns: store_manager, finance, security, security_pmd, cr_coordinator,
    // head_cr, hm_security_pmd). Unmapped keys fall back to a humanized name.
    const ROLE_DISPLAY_NAMES: Record<string, string> = {
      store_manager: 'Store Manager',
      finance: 'Finance',
      security: 'Security',
      security_pmd: 'Security (PMD)',
      cr_coordinator: 'CR Coordinator',
      head_cr: 'Head of CR',
      hm_security_pmd: 'HM Security (PMD)',
    };

    const ROLE_DISPLAY_NAMES_AR: Record<string, string> = {
      store_manager: 'مدير المخزن',
      finance: 'المالية',
      security: 'الأمن',
      security_pmd: 'الأمن (إدارة المرافق)',
      cr_coordinator: 'منسق علاقات العملاء',
      head_cr: 'رئيس علاقات العملاء',
      hm_security_pmd: 'أمن الحمراء (إدارة المرافق)',
    };

    const ROLE_RENDER_ORDER: string[] = [
      'store_manager', 'finance', 'security',
      'security_pmd', 'cr_coordinator', 'head_cr', 'hm_security_pmd',
    ];
    const ROLE_ORDER_INDEX: Record<string, number> = Object.fromEntries(
      ROLE_RENDER_ORDER.map((r, i) => [r, i]),
    );

    let approvals: ApprovalRow[] = [];

    const { data: approvalRows, error: approvalsErr } = await supabaseAdmin
      .from('gate_pass_approvals')
      .select('role_name, status, approver_user_id, approver_name, approved_at, signature, comments')
      .eq('gate_pass_id', gatePassId);

    if (approvalsErr) {
      console.error('gate_pass_approvals fetch error:', approvalsErr);
    }

    // Resolve actor_type per approver so the chain pill reads "APPROVED"
    // vs "REVIEWED" from the acting user (spec R5). Defaults to approver.
    const actorTypeByUser = new Map<string, string>();
    {
      const approverIds = Array.from(
        new Set(
          (approvalRows ?? [])
            .map((r: any) => r.approver_user_id)
            .filter((id: unknown): id is string => !!id),
        ),
      );
      if (approverIds.length > 0) {
        const { data: actorRows, error: actorErr } = await supabaseAdmin
          .from('profiles')
          .select('id, actor_type')
          .in('id', approverIds);
        if (actorErr) {
          console.error('actor_type fetch error (defaulting to approver):', actorErr);
        } else {
          for (const a of actorRows ?? []) {
            actorTypeByUser.set((a as any).id, (a as any).actor_type ?? 'approver');
          }
        }
      }
    }

    if (approvalRows && approvalRows.length > 0) {
      // Render ALL rows (approved / rejected / pending) so the chain shows
      // the full audit trail, exactly like the WP approval chain.
      approvals = approvalRows.map((r: any): ApprovalRow => ({
        name: ROLE_DISPLAY_NAMES[r.role_name]
          ?? String(r.role_name || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        nameAr: ROLE_DISPLAY_NAMES_AR[r.role_name] ?? null,
        roleKey: r.role_name,
        status: r.status,
        approver: r.approver_name,
        date: r.approved_at,
        signature: r.signature,
        comments: r.comments,
        actorType: r.approver_user_id
          ? (actorTypeByUser.get(r.approver_user_id) === 'reviewer' ? 'reviewer' : 'approver')
          : 'approver',
        stepOrder: ROLE_ORDER_INDEX[r.role_name] ?? 999,
      }));
    } else {
      // Fallback for pre-Phase-2b passes that never got reconciled. Builds
      // the same shape from legacy columns so the chain still renders.
      const rec = gp as Record<string, unknown>;
      const legacyRoles: string[] = ['store_manager', 'finance', 'security'];
      for (const roleKey of legacyRoles) {
        const name = (rec[`${roleKey}_name`] as string | null) ?? null;
        const date = (rec[`${roleKey}_date`] as string | null) ?? null;
        const sig = (rec[`${roleKey}_signature`] as string | null) ?? null;
        // Treat presence of any actioned data as approved; otherwise pending.
        const status = (name || date || sig) ? 'approved' : 'pending';
        approvals.push({
          name: ROLE_DISPLAY_NAMES[roleKey],
          nameAr: ROLE_DISPLAY_NAMES_AR[roleKey] ?? null,
          roleKey,
          status,
          approver: name,
          date,
          signature: sig,
          comments: (rec[`${roleKey}_comments`] as string | null) ?? null,
          stepOrder: ROLE_ORDER_INDEX[roleKey] ?? 999,
        });
      }
    }

    // Stable sort by render order so the chain layout is deterministic.
    approvals.sort((a, b) => a.stepOrder - b.stepOrder);

    // Shared row renderer — identical to the WP approval chain (numbered rows,
    // EN/AR roles, signer + timestamp, status pill, embedded signature / dashed
    // PENDING SIGNATURE placeholder, halo on first pending, page-break handling).
    {
      const res = await drawApprovalChain({
        ctx: { pdfDoc, pageWidth, pageHeight, margin, helvetica, helveticaBold, arabicFonts },
        layout,
        approvals,
        page,
        yPos,
        createPage,
        formatDateTime,
      });
      page = res.page;
      yPos = res.yPos;
    }

    // Footer + QR + page numbers are drawn uniformly on EVERY page below.

    // ---- Per-page footer / QR / page numbers (parity with WP) ----
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;
    const generatedOnText = 'Generated on ' + formatDateTime(new Date().toISOString());
    for (let i = 0; i < totalPages; i++) {
      const currentPage = pages[i];

      // Footer divider + left-aligned text (every page)
      currentPage.drawLine({
        start: { x: margin, y: margin + 28 },
        end:   { x: pageWidth - margin, y: margin + 28 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
      currentPage.drawText('This is an official gate pass document.', {
        x: margin, y: margin + 13, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5),
      });
      currentPage.drawText(generatedOnText, {
        x: margin, y: margin + 3, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5),
      });

      // QR code (right side) on all pages
      if (qrCode) {
        const qrSize = 45;
        const qrX = pageWidth - margin - qrSize;
        const qrY = 20;

        const moduleCount = qrCode.getModuleCount();
        const cellSize = qrSize / moduleCount;

        for (let row = 0; row < moduleCount; row++) {
          for (let col = 0; col < moduleCount; col++) {
            if (qrCode.isDark(row, col)) {
              currentPage.drawRectangle({
                x: qrX + col * cellSize,
                y: qrY + (moduleCount - 1 - row) * cellSize,
                width: cellSize,
                height: cellSize,
                color: rgb(0, 0, 0),
              });
            }
          }
        }

        const qrLabel = "Scan for gate pass";
        const labelWidth = helvetica.widthOfTextAtSize(qrLabel, 6);
        currentPage.drawText(qrLabel, {
          x: qrX + (qrSize - labelWidth) / 2,
          y: qrY - 8,
          size: 6,
          font: helvetica,
          color: rgb(0.4, 0.4, 0.4),
        });

        const passNo = gp.pass_no || "";
        const passNoWidth = helvetica.widthOfTextAtSize(passNo, 5);
        currentPage.drawText(passNo, {
          x: qrX + (qrSize - passNoWidth) / 2,
          y: qrY - 15,
          size: 5,
          font: helvetica,
          color: rgb(0.3, 0.3, 0.3),
        });
      }

      // Page number (center)
      const pageNumText = `Page ${i + 1} of ${totalPages}`;
      const textWidth = helvetica.widthOfTextAtSize(pageNumText, 9);
      currentPage.drawText(pageNumText, {
        x: (pageWidth - textWidth) / 2,
        y: 20,
        size: 9,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Save & upload
    const pdfBytes = await pdfDoc.save();
    console.log("Gate pass PDF generated:", pdfBytes.length, "bytes,", totalPages, "pages");

    const fileName = `gate-pass-${gp.pass_no.replace(/\//g, "-")}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("permit-pdfs")
      .upload(fileName, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to upload PDF: " + uploadError.message }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from("permit-pdfs")
      .createSignedUrl(fileName, 3600);

    if (signedUrlError || !signedUrlData) {
      return new Response(JSON.stringify({ error: "Failed to generate PDF URL" }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Update gate pass with pdf_url
    await supabaseAdmin
      .from("gate_passes")
      .update({ pdf_url: fileName })
      .eq("id", gatePassId);

    return new Response(
      JSON.stringify({ pdfUrl: signedUrlData.signedUrl, filePath: fileName, success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error generating gate pass PDF:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
