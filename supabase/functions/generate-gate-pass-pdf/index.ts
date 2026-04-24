import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, degrees } from "https://esm.sh/pdf-lib@1.17.1";
import qrcode from "https://esm.sh/qrcode-generator@1.4.4";

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

    // Auth check
    const isRequester = gp.requester_id === user.id;
    const { data: isApproverResult } = await supabaseAdmin.rpc("is_gate_pass_approver", { _user_id: user.id });
    const { data: isAdminResult } = await supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isRequester && !isApproverResult && !isAdminResult) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Generating gate pass PDF:", gp.pass_no);

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 50;

    const createPage = () => {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      return { page, yPos: pageHeight - margin };
    };

    const drawText = (page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont = helvetica, color = rgb(0, 0, 0)) => {
      const safeText = String(text || "").replace(/[^\x00-\x7F]/g, "");
      if (safeText && y > 30) {
        page.drawText(safeText, { x, y, size, font, color });
      }
    };

    const drawLine = (page: PDFPage, y: number) => {
      page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
    };

    const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : "N/A";
    const formatDateTime = (d: string | null) => d ? new Date(d).toLocaleString() : "N/A";

    // Load company logo
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

    // QR code
    let qrCode: any = null;
    try {
      const passNo = String(gp.pass_no || "").trim();
      if (passNo) {
        qrCode = qrcode(0, "M");
        qrCode.addData(`https://hmwp.lovable.app/gate-passes/${gp.id}`);
        qrCode.make();
      }
    } catch (e) {
      console.error("QR error:", e);
    }

    // ===== PAGE 1 =====
    let { page, yPos } = createPage();

    // Header with logo
    if (companyLogo) {
      const maxH = 50, maxW = 120;
      const s = Math.min(maxW / companyLogo.width, maxH / companyLogo.height, 1);
      page.drawImage(companyLogo, {
        x: pageWidth - margin - companyLogo.width * s,
        y: yPos - companyLogo.height * s + 10,
        width: companyLogo.width * s,
        height: companyLogo.height * s,
      });
    }

    // Title
    const title = categoryLabels[gp.pass_category] || "MATERIAL GATE PASS";
    drawText(page, title.toUpperCase(), margin, yPos, 20, helveticaBold);
    yPos -= 25;
    drawText(page, gp.pass_no, margin, yPos, 14, helveticaBold);
    yPos -= 20;

    // Status
    const statusText = (gp.status || "unknown").toUpperCase().replace(/_/g, " ");
    const statusColor = gp.status === "approved" || gp.status === "completed" ? rgb(0.13, 0.77, 0.37)
      : gp.status === "rejected" ? rgb(0.86, 0.21, 0.27) : rgb(0.42, 0.45, 0.5);
    drawText(page, "Status: " + statusText, margin, yPos, 11, helveticaBold, statusColor);
    yPos -= 15;

    // Pass type checkboxes
    const passType = typeLabels[gp.pass_type] || gp.pass_type;
    drawText(page, "Type: " + passType, margin, yPos, 10, helvetica);
    yPos -= 25;
    drawLine(page, yPos);
    yPos -= 20;

    // Two-column info
    const col1 = margin;
    const col2 = pageWidth / 2 + 10;

    drawText(page, "REQUESTOR INFORMATION", col1, yPos, 11, helveticaBold);
    drawText(page, "LOCATION & DETAILS", col2, yPos, 11, helveticaBold);
    yPos -= 16;
    drawText(page, "Name: " + (gp.requester_name || "N/A"), col1, yPos, 9, helvetica);
    drawText(page, "Unit/Floor: " + (gp.unit_floor || "N/A"), col2, yPos, 9, helvetica);
    yPos -= 13;
    drawText(page, "Email: " + (gp.requester_email || "N/A"), col1, yPos, 9, helvetica);
    drawText(page, "Delivery Area: " + (gp.delivery_area || "N/A"), col2, yPos, 9, helvetica);
    yPos -= 13;
    if (gp.client_contractor_name) {
      drawText(page, "Client/Contractor: " + gp.client_contractor_name, col1, yPos, 9, helvetica);
      yPos -= 13;
    }
    if (gp.client_rep_name) {
      drawText(page, "Client Rep: " + gp.client_rep_name, col1, yPos, 9, helvetica);
      drawText(page, "Contact: " + (gp.client_rep_contact || "N/A"), col2, yPos, 9, helvetica);
      yPos -= 13;
    }
    if (gp.delivery_type) {
      drawText(page, "Delivery Type: " + (deliveryLabels[gp.delivery_type] || gp.delivery_type), col1, yPos, 9, helvetica);
      yPos -= 13;
    }
    yPos -= 10;
    drawLine(page, yPos);
    yPos -= 20;

    // Transfer Schedule
    drawText(page, "TRANSFER SCHEDULE", margin, yPos, 11, helveticaBold);
    yPos -= 16;
    drawText(page, "From Date: " + formatDate(gp.valid_from), col1, yPos, 9, helvetica);
    drawText(page, "To Date: " + formatDate(gp.valid_to), col2, yPos, 9, helvetica);
    yPos -= 13;
    drawText(page, "Time: " + (gp.time_from || "N/A") + " - " + (gp.time_to || "N/A"), col1, yPos, 9, helvetica);
    yPos -= 13;
    if (gp.vehicle_make_model) {
      drawText(page, "Vehicle: " + gp.vehicle_make_model + " (" + (gp.vehicle_license_plate || "") + ")", col1, yPos, 9, helvetica);
      yPos -= 13;
    }
    if (gp.shifting_method) {
      drawText(page, "Shifting Method: " + (shiftingLabels[gp.shifting_method] || gp.shifting_method), col1, yPos, 9, helvetica);
      yPos -= 13;
    }
    yPos -= 10;
    drawLine(page, yPos);
    yPos -= 20;

    // Items Table
    const passItems = items || [];
    if (passItems.length > 0) {
      drawText(page, "ITEM DETAILS", margin, yPos, 11, helveticaBold);
      yPos -= 18;

      // Table header
      const tableLeft = margin;
      const colWidths = [35, 200, 60, 60, 150]; // SR, Details, Qty, High Value, Remarks
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);

      // Header row
      page.drawRectangle({ x: tableLeft, y: yPos - 15, width: tableWidth, height: 18, color: rgb(0.93, 0.93, 0.93) });
      let xOff = tableLeft + 3;
      const headers = ["SR", "Details of Item", "Qty", "High Val", "Remarks"];
      for (let h = 0; h < headers.length; h++) {
        drawText(page, headers[h], xOff, yPos - 12, 8, helveticaBold);
        xOff += colWidths[h];
      }
      yPos -= 18;

      // Draw rows
      for (const item of passItems) {
        if (yPos < 120) {
          const np = createPage();
          page = np.page;
          yPos = np.yPos;
          drawText(page, "ITEM DETAILS (continued)", margin, yPos, 11, helveticaBold);
          yPos -= 18;
        }

        // Row border
        page.drawRectangle({
          x: tableLeft, y: yPos - 15, width: tableWidth, height: 18,
          borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5,
        });

        xOff = tableLeft + 3;
        drawText(page, String(item.serial_number), xOff, yPos - 12, 8, helvetica);
        xOff += colWidths[0];

        const details = String(item.item_details || "").substring(0, 40);
        drawText(page, details, xOff, yPos - 12, 8, helvetica);
        xOff += colWidths[1];

        drawText(page, String(item.quantity || "1"), xOff, yPos - 12, 8, helvetica);
        xOff += colWidths[2];

        drawText(page, item.is_high_value ? "Yes" : "No", xOff, yPos - 12, 8, helvetica,
          item.is_high_value ? rgb(0.86, 0.21, 0.27) : rgb(0.3, 0.3, 0.3));
        xOff += colWidths[3];

        const remarks = String(item.remarks || "-").substring(0, 30);
        drawText(page, remarks, xOff, yPos - 12, 8, helvetica);

        yPos -= 18;
      }
      yPos -= 10;
    }

    // Purpose
    if (gp.purpose) {
      if (yPos < 120) {
        const np = createPage();
        page = np.page;
        yPos = np.yPos;
      }
      drawLine(page, yPos);
      yPos -= 20;
      drawText(page, "PURPOSE OF MATERIAL SHIFTING", margin, yPos, 11, helveticaBold);
      yPos -= 16;
      const purposeText = String(gp.purpose).substring(0, 300);
      const words = purposeText.split(" ");
      let line = "";
      for (const word of words) {
        const test = line + word + " ";
        if (test.length > 85) {
          drawText(page, line.trim(), margin, yPos, 9, helvetica);
          yPos -= 13;
          line = word + " ";
        } else {
          line = test;
        }
      }
      if (line.trim()) {
        drawText(page, line.trim(), margin, yPos, 9, helvetica);
        yPos -= 13;
      }
      yPos -= 10;
    }

    // Forklift warning
    if (gp.shifting_method === "forklift") {
      drawText(page, "NOTE: Materials shifting using forklift in Al Hamra premises shall obtain a valid Work Permit.", margin, yPos, 8, helveticaBold, rgb(0.86, 0.21, 0.27));
      yPos -= 15;
    }

    // ===== SIGNATURES SECTION =====
    if (yPos < 250) {
      const np = createPage();
      page = np.page;
      yPos = np.yPos;
    }
    drawLine(page, yPos);
    yPos -= 25;
    drawText(page, "APPROVALS & SIGNATURES", margin, yPos, 12, helveticaBold);
    yPos -= 25;

    // ---- Phase 2c-4: approvals sourced from gate_pass_approvals ----
    // Populated by Phase 2b dual-write. Replaces the hardcoded 3-block
    // array that read store_manager_*, finance_*, security_* columns
    // directly off the gate pass row. Titles + render order preserved.
    const ROLE_BLOCK_TITLES: Record<string, string> = {
      store_manager:   "Approved By (Store Manager)",
      finance:         "Department Verification (Finance)",
      security:        "Security Sign-off",
      // PMD-workflow passes — legacy never rendered these so they only
      // appear when gate_pass_approvals has rows for them.
      security_pmd:    "Security (PMD)",
      cr_coordinator:  "CR Coordinator",
      head_cr:         "Head CR",
      hm_security_pmd: "HM Security (PMD)",
    };
    const ROLE_RENDER_ORDER = [
      'store_manager', 'finance', 'security',
      'security_pmd', 'cr_coordinator', 'head_cr', 'hm_security_pmd',
    ];
    const ROLE_ORDER_INDEX: Record<string, number> = Object.fromEntries(
      ROLE_RENDER_ORDER.map((r, i) => [r, i]),
    );

    type SigBlock = {
      title: string;
      roleKey: string;
      name: string | null;
      date: string | null;
      comments: string | null;
      signature: string | null;
    };

    let sigBlocks: SigBlock[] = [];

    const { data: approvalRows, error: approvalsErr } = await supabaseAdmin
      .from('gate_pass_approvals')
      .select('role_name, status, approver_name, approved_at, signature, comments')
      .eq('gate_pass_id', gatePassId);

    if (approvalsErr) {
      console.error('gate_pass_approvals fetch error:', approvalsErr);
    }

    if (approvalRows && approvalRows.length > 0) {
      sigBlocks = approvalRows
        .filter((r) => r.status === 'approved' || r.status === 'rejected')
        .map((r): SigBlock => ({
          title: ROLE_BLOCK_TITLES[r.role_name] ?? r.role_name,
          roleKey: r.role_name,
          name: r.approver_name,
          date: r.approved_at,
          signature: r.signature,
          comments: r.comments,
        }));
    } else {
      // Fallback for pre-Phase-2b passes that never got reconciled. Builds
      // the same shape from legacy columns so the PDF still renders.
      // Removable in the cleanup phase once legacy columns are dropped.
      const rec = gp as Record<string, unknown>;
      const legacyRoles: string[] = ['store_manager', 'finance', 'security'];
      for (const roleKey of legacyRoles) {
        const name = (rec[`${roleKey}_name`] as string | null) ?? null;
        const date = (rec[`${roleKey}_date`] as string | null) ?? null;
        if (!name && !date) continue;
        sigBlocks.push({
          title: ROLE_BLOCK_TITLES[roleKey],
          roleKey,
          name,
          date,
          comments: (rec[`${roleKey}_comments`] as string | null) ?? null,
          signature: (rec[`${roleKey}_signature`] as string | null) ?? null,
        });
      }
    }

    // Stable sort by render order so grid layout is byte-identical for
    // identical input data.
    sigBlocks.sort((a, b) => {
      const oa = ROLE_ORDER_INDEX[a.roleKey] ?? Number.POSITIVE_INFINITY;
      const ob = ROLE_ORDER_INDEX[b.roleKey] ?? Number.POSITIVE_INFINITY;
      return oa - ob;
    });

    // Filter to only show blocks that have been actioned (existing
    // behavior preserved — pending blocks never appeared on the PDF).
    const activeSigs = sigBlocks.filter(s => s.name || s.date);

    const sigColCount = 3;
    const sigColWidth = (pageWidth - 2 * margin) / sigColCount;
    const sigRowHeight = 130;

    for (let i = 0; i < activeSigs.length; i++) {
      const sig = activeSigs[i];
      const colIdx = i % sigColCount;
      const xPos = margin + colIdx * sigColWidth;

      if (colIdx === 0 && i > 0) {
        yPos -= sigRowHeight;
        if (yPos < 120) {
          const np = createPage();
          page = np.page;
          yPos = np.yPos;
        }
      }

      const cellY = yPos;

      // Box border
      page.drawRectangle({
        x: xPos, y: cellY - sigRowHeight + 10,
        width: sigColWidth - 10, height: sigRowHeight - 5,
        borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5,
      });

      let cy = cellY - 14;
      drawText(page, sig.title, xPos + 5, cy, 8, helveticaBold);
      cy -= 16;
      drawText(page, "Name: " + (sig.name || "N/A"), xPos + 5, cy, 8, helvetica, rgb(0.3, 0.3, 0.3));
      cy -= 12;
      drawText(page, "Date: " + formatDateTime(sig.date), xPos + 5, cy, 7, helvetica, rgb(0.5, 0.5, 0.5));
      cy -= 12;

      if (sig.comments && sig.comments.trim()) {
        const comment = sig.comments.trim().substring(0, 40);
        drawText(page, '"' + comment + '"', xPos + 5, cy, 6, helvetica, rgb(0.4, 0.4, 0.4));
        cy -= 10;
      }

      // Embed signature image
      if (sig.signature && sig.signature.startsWith("data:image")) {
        try {
          const base64Data = sig.signature.split(",")[1];
          if (base64Data) {
            const sigBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            let sigImage;
            if (sig.signature.includes("image/png")) {
              sigImage = await pdfDoc.embedPng(sigBytes);
            } else {
              sigImage = await pdfDoc.embedJpg(sigBytes);
            }
            if (sigImage) {
              const maxW = 90, maxSH = 35;
              const sc = Math.min(maxW / sigImage.width, maxSH / sigImage.height, 1);
              page.drawImage(sigImage, {
                x: xPos + 5, y: cy - sigImage.height * sc,
                width: sigImage.width * sc, height: sigImage.height * sc,
              });
            }
          }
        } catch (sigErr) {
          console.error("Signature embed error:", sigErr);
        }
      }
    }

    // CCTV confirmation
    if (gp.security_cctv_confirmed) {
      yPos -= sigRowHeight + 10;
      drawText(page, "CCTV Monitoring Confirmed", margin, yPos, 9, helveticaBold, rgb(0.13, 0.77, 0.37));
      yPos -= 15;
    }

    // Add page numbers, watermark, logo, QR to all pages
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;
    for (let i = 0; i < totalPages; i++) {
      const cp = pages[i];

      // Watermark
      cp.drawText("CONFIDENTIAL", {
        x: pageWidth / 2 - 150, y: pageHeight / 2 - 20,
        size: 60, font: helveticaBold, color: rgb(0.9, 0.9, 0.9),
        rotate: degrees(45), opacity: 0.3,
      });

      // Logo on subsequent pages
      if (companyLogo && i > 0) {
        const maxH = 50, maxW = 120;
        const s = Math.min(maxW / companyLogo.width, maxH / companyLogo.height, 1);
        cp.drawImage(companyLogo, {
          x: pageWidth - margin - companyLogo.width * s,
          y: pageHeight - margin - companyLogo.height * s + 10,
          width: companyLogo.width * s, height: companyLogo.height * s,
        });
      }

      // QR code
      if (qrCode) {
        const qrSize = 45;
        const qrX = pageWidth - margin - qrSize;
        const qrY = 20;
        const moduleCount = qrCode.getModuleCount();
        const cellSize = qrSize / moduleCount;
        for (let row = 0; row < moduleCount; row++) {
          for (let col = 0; col < moduleCount; col++) {
            if (qrCode.isDark(row, col)) {
              cp.drawRectangle({
                x: qrX + col * cellSize,
                y: qrY + (moduleCount - 1 - row) * cellSize,
                width: cellSize, height: cellSize, color: rgb(0, 0, 0),
              });
            }
          }
        }
        const qrLabel = "Scan for gate pass";
        const labelW = helvetica.widthOfTextAtSize(qrLabel, 6);
        cp.drawText(qrLabel, { x: qrX + (qrSize - labelW) / 2, y: qrY - 8, size: 6, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
        const passNoW = helvetica.widthOfTextAtSize(gp.pass_no, 5);
        cp.drawText(gp.pass_no, { x: qrX + (qrSize - passNoW) / 2, y: qrY - 15, size: 5, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
      }

      // Page number
      const pageNumText = `Page ${i + 1} of ${totalPages}`;
      const tw = helvetica.widthOfTextAtSize(pageNumText, 9);
      cp.drawText(pageNumText, { x: (pageWidth - tw) / 2, y: 20, size: 9, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
    }

    // Footer on first page
    const firstPage = pages[0];
    drawLine(firstPage, 50);
    drawText(firstPage, "Generated on " + new Date().toLocaleString(), margin, 35, 8, helvetica, rgb(0.5, 0.5, 0.5));
    drawText(firstPage, "Al Hamra - Material Gate Pass", pageWidth - margin - 160, 35, 8, helvetica, rgb(0.5, 0.5, 0.5));

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
