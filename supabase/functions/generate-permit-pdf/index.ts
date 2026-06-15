import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";
import qrcode from "https://esm.sh/qrcode-generator@1.4.4";
import {
  loadArabicFont,
  drawArabic,
  arabicLabel,
} from "../_shared/pdf-bilingual.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting for PDF generation (resource-intensive operation)
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_PDF_GENERATIONS_PER_WINDOW = 10;
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkPdfRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(userId);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  
  if (record.count >= MAX_PDF_GENERATIONS_PER_WINDOW) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  record.count++;
  return { allowed: true };
}

interface GeneratePdfRequest {
  permitId: string;
}

interface SignatureAuditLog {
  role: string;
  ip_address: string | null;
  created_at: string;
  user_name: string;
}

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Create service role client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(JSON.stringify({ error: "Unauthorized - No authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Create a client with the user's token to verify their identity
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey);

    // Pass the JWT explicitly (edge runtime has no persisted session)
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Unauthorized - Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Authenticated user:", user.id, user.email);

    // Check rate limit for PDF generation
    const rateLimitResult = checkPdfRateLimit(user.id);
    if (!rateLimitResult.allowed) {
      console.warn("Rate limit exceeded for PDF generation:", user.id);
      return new Response(
        JSON.stringify({ error: "Too many PDF generation requests. Please wait before trying again." }),
        { 
          status: 429, 
          headers: { 
            "Content-Type": "application/json",
            "Retry-After": String(rateLimitResult.retryAfter),
            ...corsHeaders 
          } 
        }
      );
    }

    const { permitId }: GeneratePdfRequest = await req.json();
    console.log("Generating PDF for permit:", permitId);

    if (!permitId) {
      return new Response(JSON.stringify({ error: "Permit ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if user has access to this permit
    // User must either be the requester or an approver
    const { data: permit, error: permitError } = await supabaseAdmin
      .from("work_permits")
      .select("*, work_types(*)")
      .eq("id", permitId)
      .single();

    if (permitError || !permit) {
      console.error("Permit fetch error:", permitError);
      return new Response(JSON.stringify({ error: "Permit not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch signature audit logs for this permit
    const { data: signatureAuditLogs } = await supabaseAdmin
      .from("signature_audit_logs")
      .select("role, ip_address, created_at, user_name")
      .eq("permit_id", permitId)
      .eq("action", "signature_approval")
      .order("created_at", { ascending: true });

    console.log("Fetched signature audit logs:", signatureAuditLogs?.length || 0);

    // Create a map of role to audit info for quick lookup
    const auditInfoByRole = new Map<string, SignatureAuditLog>();
    if (signatureAuditLogs) {
      for (const log of signatureAuditLogs) {
        auditInfoByRole.set(log.role.toLowerCase(), log);
      }
    }

    // Authorization check: user must be requester or approver
    const isRequester = permit.requester_id === user.id;
    
    // Check if user is an approver
    const { data: isApproverResult } = await supabaseAdmin.rpc('is_approver', { _user_id: user.id });
    const isApprover = isApproverResult === true;

    // Check if user is admin
    const { data: isAdminResult } = await supabaseAdmin.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'admin' 
    });
    const isAdmin = isAdminResult === true;

    if (!isRequester && !isApprover && !isAdmin) {
      console.error("User not authorized to generate PDF for this permit:", user.id);
      return new Response(JSON.stringify({ error: "Forbidden - You don't have access to this permit" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Tenant-only restriction: a user whose ONLY role is `tenant` must not
    // be able to view/download the permit PDF while it is still moving
    // through the approval workflow — otherwise they could read who is
    // currently holding the permit. They get access only once the permit
    // is fully `approved`. Users with `tenant` + any other role (e.g.
    // tenant + approver) are unaffected.
    const { data: tenantRoleRows } = await supabaseAdmin
      .from("user_roles")
      .select("roles!inner(name)")
      .eq("user_id", user.id);
    const roleNames: string[] = (tenantRoleRows ?? [])
      .map((r: any) => (r.roles?.name ?? "").toLowerCase())
      .filter(Boolean);
    const isTenantOnly =
      roleNames.length > 0 &&
      roleNames.includes("tenant") &&
      roleNames.every((n) => n === "tenant");

    if (isTenantOnly && permit.status !== "approved") {
      console.warn(
        "Blocked tenant-only user from PDF on non-approved permit:",
        user.id,
        permit.permit_no,
        permit.status,
      );
      return new Response(
        JSON.stringify({
          error: "PDF is available once the permit is fully approved.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    console.log("Authorization check passed. User:", user.email, "isRequester:", isRequester, "isApprover:", isApprover, "isAdmin:", isAdmin);
    console.log("Permit found:", permit.permit_no, "Status:", permit.status);

    // Generate the PDF using pdf-lib
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Phase 4b: Arabic font for bilingual labels. Loaded async because the
    // first call fetches the TTF from CDN (~400KB cold-start cost). On
    // failure (network, invalid font, library missing) we fall back to
    // English-only — better than crashing the whole PDF.
    const arabicFonts = await loadArabicFont(pdfDoc);
    if (!arabicFonts) {
      console.warn("[generate-permit-pdf] ARABIC FONT UNAVAILABLE — rendering English-only. See loadArabicFont logs above for the underlying cause (font fetch, fontkit import, or embed failure).");
    } else {
      console.log("[generate-permit-pdf] Arabic fonts loaded OK (regular+bold embedded).");
    }
    
    // A4 page size (595.28 x 841.89 pt) per docs/design/README.md
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 22;
    
    // Helper functions
    const createPage = () => {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      return { page, yPos: pageHeight - margin };
    };

    /**
     * Truncate a string so it fits inside `maxWidth` when rendered at
     * the given font + size, adding an ellipsis if anything was cut.
     * Used by the attachment grid for filename labels — file names
     * are often longer than a cell width, especially with mobile
     * camera generated names like 'IMG_20260513_104755_civil_id.jpg'.
     */
    const truncateForWidth = (text: string, maxWidth: number, font: PDFFont, size: number): string => {
      const safe = String(text || '').replace(/[^\x00-\x7F]/g, '');
      if (!safe) return '';
      if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
      const ellipsis = '...';
      let lo = 0;
      let hi = safe.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        const candidate = safe.slice(0, mid) + ellipsis;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      return safe.slice(0, lo) + ellipsis;
    };

    // pdf-lib's standard Helvetica is WinAnsi-encoded — it cannot draw
    // chars outside that codepage (→, em/en dashes, curly quotes, …).
    // Sanitize every string we draw with the Latin font.
    const sanitizeWinAnsi = (text: string): string => {
      if (!text) return '';
      return String(text)
        .replace(/\u2192/g, '->')
        .replace(/\u2190/g, '<-')
        // Broad dash family: hyphen, non-breaking hyphen, figure dash,
        // en-dash, em-dash, horizontal bar, minus sign → ASCII '-'
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/\u2026/g, '...')
        .replace(/\u00A0/g, ' ')
        .replace(/[^\x00-\xFF]/g, '?');
    };

    const drawText = (page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont = helvetica, color = rgb(0, 0, 0)) => {
      const safeText = sanitizeWinAnsi(String(text || ''));
      if (safeText && y > 30) {
        page.drawText(safeText, { x, y, size, font, color });
      }
    };
    
    const drawLine = (page: PDFPage, y: number) => {
      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
      });
    };

    // ---- Phase 4a: Al Hamra brand constants -------------------------------
    // Mirrors src/index.css tokens. Used by the brand-styled drawing
    // helpers below so future palette changes are one-file edits here.
    //   BRAND_RED   #CD1719 — primary identifier (titles, accents)
    //   BRAND_GREY  #B2B2B2 — borders, dividers, subtle hairlines
    //   BRAND_DARK  #1D1D1B — body text (used sparingly per identity guide)
    //   BRAND_LIGHT #EDEDED — surface fills behind headers
    const BRAND_RED   = rgb(0.804, 0.090, 0.098);
    const BRAND_GREY  = rgb(0.698, 0.698, 0.698);
    const BRAND_DARK  = rgb(0.114, 0.114, 0.106);
    const BRAND_LIGHT = rgb(0.929, 0.929, 0.929);

    /** Major section divider — thicker, brand red. For top-of-section breaks. */
    const drawBrandLine = (page: PDFPage, y: number) => {
      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 1.5,
        color: BRAND_RED,
      });
    };

    /** Section header — "APPROVALS & SIGNATURES" style. Brand-red + thin
     *  underline below to anchor the section visually.
     *
     *  Phase 4b: also draws the Arabic translation right-aligned on the
     *  same line. Falls back to English-only when arabicFonts is null
     *  (font load failed) or the label has no Arabic translation. */
    // Added 2026-05-17: aligns with the v3 PDF design reference at
    // docs/design/work-permit-pdf-template.html. The previous look
    // (red text on a thin grey underline) is replaced by a solid
    // black bar with white text — matching the Hot Works permit
    // form aesthetic used elsewhere in Al Hamra's official documents.
    // Burgundy subsection bars are introduced for numbered subsections.
    const SECTION_BAR_INK    = rgb(0.102, 0.102, 0.102); // matches --section-bar #1a1a1a
    const SUBSECTION_BAR_INK = rgb(0.478, 0.082, 0.094); // matches --subsection-bar #7a1518
    const WHITE              = rgb(1, 1, 1);

    /** Section header — top-level black banner with white text.
     *  Replaces the legacy red-text-on-grey-underline style.
     *  Bilingual: English left, Arabic right inside the same bar. */
    const drawSectionHeader = async (page: PDFPage, text: string, y: number, size = 11) => {
      const barHeight = size + 8;
      // Filled black banner spanning the content width
      page.drawRectangle({
        x: margin, y: y - barHeight + size + 2,
        width: pageWidth - margin * 2, height: barHeight,
        color: SECTION_BAR_INK,
      });
      drawText(page, text, margin + 8, y, size, helveticaBold, WHITE);
      const ar = arabicLabel(text);
      if (arabicFonts && ar) {
        await drawArabic(page, ar, pageWidth - margin - 8, y, {
          font: arabicFonts.bold,
          size,
          color: WHITE,
        });
      }
    };

    /** Subsection header — numbered burgundy banner. Use for the
     *  numbered subsections within each top-level section
     *  (1. CLIENT/CONTRACTOR DETAILS, 2. WORK DESCRIPTION, etc.). */
    const drawSubsectionHeader = async (page: PDFPage, text: string, y: number, size = 10) => {
      const barHeight = size + 6;
      page.drawRectangle({
        x: margin, y: y - barHeight + size + 1,
        width: pageWidth - margin * 2, height: barHeight,
        color: SUBSECTION_BAR_INK,
      });
      drawText(page, text, margin + 8, y, size, helveticaBold, WHITE);
      const ar = arabicLabel(text);
      if (arabicFonts && ar) {
        await drawArabic(page, ar, pageWidth - margin - 8, y, {
          font: arabicFonts.bold,
          size,
          color: WHITE,
        });
      }
    };

    // ---- Hot Works template helpers (field-grid, doc-id strip, checkboxes) ----
    const FIELD_LABEL_GREY = rgb(0.541, 0.541, 0.541);
    const FIELD_UNDERLINE  = rgb(0.847, 0.847, 0.847); // --line #d8d8d8
    const CELL_DIVIDER     = rgb(0.925, 0.925, 0.925); // --line-soft #ececec

    /** Underlined field — small grey EN label (+ optional AR) above a
     *  value with a thin underline. Mirrors `.field-grid` in the
     *  reference template. */
    const drawField = async (
      page: PDFPage,
      opts: { labelEn: string; labelAr?: string | null; value: string;
              x: number; y: number; width: number; valueBold?: boolean },
    ) => {
      // EN label (uppercase tracked feel via plain helveticaBold @ 7pt)
      drawText(page, opts.labelEn.toUpperCase(), opts.x, opts.y, 7, helveticaBold, FIELD_LABEL_GREY);
      // AR label right-aligned on the same line, if available
      const ar = opts.labelAr ?? arabicLabel(opts.labelEn);
      if (arabicFonts && ar) {
        await drawArabic(page, ar, opts.x + opts.width, opts.y, {
          font: arabicFonts.regular, size: 7, color: FIELD_LABEL_GREY,
        });
      }
      // Value below
      const valueY = opts.y - 12;
      drawText(
        page, opts.value || '—', opts.x, valueY, 10,
        opts.valueBold ? helveticaBold : helvetica, BRAND_DARK,
      );
      // Underline
      page.drawLine({
        start: { x: opts.x, y: valueY - 3 },
        end:   { x: opts.x + opts.width, y: valueY - 3 },
        thickness: 0.5, color: FIELD_UNDERLINE,
      });
    };

    /** Doc-ID strip — four equal cells with EN/AR label + value. */
    const drawDocIdStrip = async (
      page: PDFPage,
      y: number,
      cells: Array<{ labelEn: string; value: string; mono?: boolean }>,
    ) => {
      const stripH = 44;
      const stripW = pageWidth - margin * 2;
      const cellW = stripW / cells.length;
      // Outer border
      page.drawRectangle({
        x: margin, y: y - stripH, width: stripW, height: stripH,
        borderColor: FIELD_UNDERLINE, borderWidth: 0.6,
      });
      for (let i = 0; i < cells.length; i++) {
        const cx = margin + i * cellW;
        // Vertical divider between cells (not after last)
        if (i > 0) {
          page.drawLine({
            start: { x: cx, y: y - stripH + 4 },
            end:   { x: cx, y: y - 4 },
            thickness: 0.4, color: CELL_DIVIDER,
          });
        }
        // EN label
        drawText(page, cells[i].labelEn.toUpperCase(), cx + 6, y - 11, 7, helveticaBold, FIELD_LABEL_GREY);
        // AR label right-aligned
        const ar = arabicLabel(cells[i].labelEn);
        if (arabicFonts && ar) {
          await drawArabic(page, ar, cx + cellW - 6, y - 11, {
            font: arabicFonts.regular, size: 7, color: FIELD_LABEL_GREY,
          });
        }
        // Value (bold dark)
        drawText(page, cells[i].value || '—', cx + 6, y - 30, 11, helveticaBold, BRAND_DARK);
      }
    };

    /** Four bilingual zone checkboxes (Business Tower / Shopping
     *  Center / Carpark / Outdoor) laid out horizontally in a single
     *  row, right-aligned. The one matching permit.building_zone is ticked. */
    const ZONE_ITEMS: Array<{ key: string; label: string }> = [
      { key: 'business_tower',  label: 'Business Tower'  },
      { key: 'shopping_center', label: 'Shopping Center' },
      { key: 'carpark',         label: 'Carpark'         },
      { key: 'outdoor',         label: 'Outdoor'         },
    ];
    const drawZoneCheckboxes = async (
      page: PDFPage,
      rightX: number,
      topY: number,
      selectedKey: string | null,
    ) => {
      // Horizontal row: [box] label   [box] label   ...
      // Laid out RIGHT-to-LEFT from rightX so the row hugs the right edge.
      const boxSize = 8;
      const labelSize = 7;
      const boxLabelGap = 3;
      const itemGap = 10;
      const y = topY - boxSize; // baseline of the row

      // Measure each item width (box + gap + label)
      const items = ZONE_ITEMS.map((it) => {
        const w = boxSize + boxLabelGap +
          helvetica.widthOfTextAtSize(it.label, labelSize);
        return { ...it, w };
      });

      // Walk left-to-right starting from the leftmost x so order reads
      // Business Tower → Shopping Center → Carpark → Outdoor.
      const totalW = items.reduce((s, it) => s + it.w, 0) +
        itemGap * (items.length - 1);
      let cursorX = rightX - totalW;

      for (const { key, label, w } of items) {
        const isTicked = selectedKey === key;
        page.drawRectangle({
          x: cursorX, y, width: boxSize, height: boxSize,
          borderColor: BRAND_DARK, borderWidth: 0.7,
          color: isTicked ? BRAND_DARK : undefined,
        });
        if (isTicked) {
          page.drawLine({
            start: { x: cursorX + 1.5, y: y + boxSize / 2 },
            end:   { x: cursorX + boxSize / 2 - 0.5, y: y + 1.5 },
            thickness: 1.1, color: WHITE,
          });
          page.drawLine({
            start: { x: cursorX + boxSize / 2 - 0.5, y: y + 1.5 },
            end:   { x: cursorX + boxSize - 1, y: y + boxSize - 1 },
            thickness: 1.1, color: WHITE,
          });
        }
        drawText(
          page, label,
          cursorX + boxSize + boxLabelGap, y + 1, labelSize,
          isTicked ? helveticaBold : helvetica, BRAND_DARK,
        );
        cursorX += w + itemGap;
      }
    };

    const pad2 = (n: number) => n.toString().padStart(2, '0');
    const formatDate = (date: string) => {
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
    const workType = permit.work_types?.name || 'General Work';

    // Try to fetch company logo from storage
    let companyLogo: any = null;
    try {
      const { data: logoData, error: logoError } = await supabaseAdmin.storage
        .from("company-assets")
        .download("company-logo.jpg");
      
      if (!logoError && logoData) {
        const arrayBuffer = await logoData.arrayBuffer();
        const logoBytes = new Uint8Array(arrayBuffer);
        companyLogo = await pdfDoc.embedJpg(logoBytes);
        console.log("Company logo embedded successfully");
      } else {
        // Try PNG format
        const { data: logoPngData, error: logoPngError } = await supabaseAdmin.storage
          .from("company-assets")
          .download("company-logo.png");
        
        if (!logoPngError && logoPngData) {
          const arrayBuffer = await logoPngData.arrayBuffer();
          const logoBytes = new Uint8Array(arrayBuffer);
          companyLogo = await pdfDoc.embedPng(logoBytes);
          console.log("Company logo (PNG) embedded successfully");
        } else {
          console.log("No company logo found in storage");
        }
      }
    } catch (logoErr) {
      console.error("Error loading company logo:", logoErr);
    }

    // ===== PAGE 1: Main Permit Details =====
    let { page, yPos } = createPage();
    
    // Generate QR code containing the public verification URL
    // (We draw it directly into the PDF to avoid PNG/canvas dependencies in the runtime)
    let qrCode: any = null;
    try {
      const permitNoForQr = String(permit.permit_no || "").trim();
      if (!permitNoForQr) throw new Error("Missing permit number for QR code");

      // Create the public verification URL (points to /status for unauthenticated access).
      // Env-driven; was hardcoded to the old hmwp.lovable.app domain.
      const verificationBaseUrl = Deno.env.get("HMWP_BASE_URL") || "https://www.hmwp.alhamra.com.kw";
      const verificationUrl = `${verificationBaseUrl}/status?permit=${encodeURIComponent(permitNoForQr)}`;
      
      qrCode = qrcode(0, "M");
      qrCode.addData(verificationUrl);
      qrCode.make();

      console.log("QR code matrix generated for permit number:", permitNoForQr);
    } catch (qrError) {
      console.error("Error generating QR code:", qrError);
    }

    // ---- Top-right chrome: company logo FIRST (topmost), then zone
    //      checkboxes lower down near the red brand line. The
    //      Arabic+English title block lives in the left column unaffected.
    const chromeTopY = yPos;
    const chromeRightX = pageWidth - margin;
    // The brand line sits 52 pt below chromeTopY: 26 (Arabic) + 18 (title)
    // + 8 (permit number). Position the checkbox row just above it.
    const brandLineY = chromeTopY - 52;

    // 1. Logo at the top, right-aligned
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

    // 2. Zone checkboxes row sits just above the brand line (4 pt gap)
    await drawZoneCheckboxes(page, chromeRightX, brandLineY + 12, (permit as any).building_zone ?? null);
    chromeBottomY = Math.min(chromeBottomY, brandLineY + 4);

    // ---- Bilingual title block (left column) ----
    if (arabicFonts) {
      await drawArabic(page, arabicLabel('WORK PERMIT') ?? '', margin + 180, yPos, {
        font: arabicFonts.bold,
        size: 26,
        color: BRAND_DARK,
      });
    }
    yPos -= 26;
    drawText(page, 'Work Permit Form', margin, yPos, 20, helveticaBold, BRAND_DARK);
    yPos -= 18;
    drawText(page, permit.permit_no || '', margin, yPos, 14, helveticaBold, BRAND_RED);
    yPos -= 8;
    drawBrandLine(page, yPos);
    yPos -= 16;

    // Don't let doc-ID strip collide with the right-column chrome.
    if (yPos > chromeBottomY) yPos = chromeBottomY;
    yPos -= 8;

    // ---- Doc-ID strip (Permit No. / Work Type / Urgency / Issued) ----
    await drawDocIdStrip(page, yPos, [
      { labelEn: 'Permit No.', value: permit.permit_no || '—' },
      { labelEn: 'Work Type', value: workType },
      { labelEn: 'Urgency',   value: (permit as any).urgency || 'Normal' },
      { labelEn: 'Issued',    value: formatDate(permit.created_at) },
    ]);
    yPos -= 50;

    // ---- Approvals data fetch (kept above status badge logic) ----
    const ROLE_DISPLAY_NAMES: Record<string, string> = {
      customer_service: 'Customer Service',
      cr_coordinator: 'CR Coordinator',
      head_cr: 'Head of CR',
      helpdesk: 'Helpdesk',
      pm: 'PM',
      pd: 'PD',
      bdcr: 'BDCR',
      mpr: 'MPR',
      it: 'IT',
      fitout: 'Fit-Out',
      ecovert_supervisor: 'Ecovert Supervisor',
      pmd_coordinator: 'PMD Coordinator',
      fmsp_approval: 'FMSP Approval',
    };

    const ROLE_DISPLAY_NAMES_AR: Record<string, string> = {
      customer_service: 'خدمة العملاء',
      cr_coordinator: 'منسق علاقات العملاء',
      head_cr: 'رئيس علاقات العملاء',
      helpdesk: 'الدعم الفني',
      pm: 'إدارة العقار',
      pd: 'تطوير المشاريع',
      bdcr: 'العلاقات التجارية',
      mpr: 'إدارة الصيانة',
      it: 'تكنولوجيا المعلومات',
      fitout: 'التجهيزات الداخلية',
      ecovert_supervisor: 'مشرف إيكوفرت',
      pmd_coordinator: 'منسق إدارة المرافق',
      fmsp_approval: 'اعتماد إدارة المرافق',
    };

    const ROLE_RENDER_ORDER: string[] = [
      'customer_service', 'cr_coordinator', 'head_cr',
      'helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 'it',
      'fitout', 'ecovert_supervisor', 'pmd_coordinator',
      'fmsp_approval',
    ];
    const ROLE_ORDER_INDEX: Record<string, number> = Object.fromEntries(
      ROLE_RENDER_ORDER.map((r, i) => [r, i]),
    );

    type ApprovalRow = {
      name: string;
      nameAr: string | null;
      roleKey: string;
      status: string | null;
      approver: string | null;
      date: string | null;
      signature: string | null;
      comments: string | null;
      stepOrder: number;
    };

    let approvals: ApprovalRow[] = [];

    const { data: approvalRows, error: approvalsErr } = await supabaseAdmin
      .from('permit_approvals')
      .select('role_name, status, approver_name, approved_at, signature, comments, workflow_step_id, workflow_steps(step_order)')
      .eq('permit_id', permitId);

    if (approvalsErr) {
      console.error('permit_approvals fetch error:', approvalsErr);
    }

    if (approvalRows && approvalRows.length > 0) {
      approvals = approvalRows.map((r: any): ApprovalRow => ({
        name: ROLE_DISPLAY_NAMES[r.role_name]
          ?? r.role_name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        nameAr: ROLE_DISPLAY_NAMES_AR[r.role_name] ?? null,
        roleKey: r.role_name,
        status: r.status,
        approver: r.approver_name,
        date: r.approved_at,
        signature: r.signature,
        comments: r.comments,
        stepOrder: (r.workflow_steps?.step_order ?? null)
          ?? ROLE_ORDER_INDEX[r.role_name] ?? 999,
      }));
      approvals.sort((a, b) => a.stepOrder - b.stepOrder);
    } else {
      const p = permit as Record<string, unknown>;
      for (const roleKey of ROLE_RENDER_ORDER) {
        const status = p[`${roleKey}_status`] as string | null | undefined;
        if (status !== 'approved' && status !== 'rejected') continue;
        approvals.push({
          name: ROLE_DISPLAY_NAMES[roleKey],
          nameAr: ROLE_DISPLAY_NAMES_AR[roleKey] ?? null,
          roleKey,
          status,
          approver: (p[`${roleKey}_approver_name`] as string | null) ?? null,
          date: (p[`${roleKey}_date`] as string | null) ?? null,
          signature: (p[`${roleKey}_signature`] as string | null) ?? null,
          comments: (p[`${roleKey}_comments`] as string | null) ?? null,
          stepOrder: ROLE_ORDER_INDEX[roleKey] ?? 999,
        });
      }
    }

    approvals.sort((a, b) => a.stepOrder - b.stepOrder);

    // Status badge — one-word summary derived from permit_approvals.
    const anyRejected = approvals.some((a) => a.status === 'rejected');
    const anyApproved = approvals.some((a) => a.status === 'approved');
    const anyPending = approvals.some((a) => a.status === 'pending');

    let statusText: string;
    let statusColor: ReturnType<typeof rgb>;

    if (permit.status === 'draft' || permit.status === 'cancelled') {
      statusText = (permit.status || 'unknown').toUpperCase();
      statusColor = rgb(0.42, 0.45, 0.5);
    } else if (anyRejected || permit.status === 'rejected') {
      statusText = 'REJECTED';
      statusColor = BRAND_RED;
    } else if (!anyPending && anyApproved) {
      statusText = 'APPROVED';
      statusColor = rgb(0.13, 0.77, 0.37);
    } else {
      statusText = 'PENDING';
      statusColor = rgb(0.95, 0.6, 0.07);
    }
    drawText(page, 'Status: ' + statusText, margin, yPos, 9, helveticaBold, statusColor);
    yPos -= 18;

    // ====================================================================
    // SECTION A — PERMIT DETAILS  (1. Client + 2. Contractor + 3. Work Desc)
    // ====================================================================
    await drawSectionHeader(page, 'SECTION A — PERMIT DETAILS', yPos, 11);
    yPos -= 26;

    // ---- Subsection 1: Client Details (field-grid) ----
    await drawSubsectionHeader(page, '1. Client Details', yPos, 10);
    yPos -= 22;

    const contentW = pageWidth - margin * 2;
    const gridGap = 12;
    const col3W = (contentW - gridGap * 2) / 3;
    const c1x = margin;
    const c2x = margin + col3W + gridGap;
    const c3x = margin + (col3W + gridGap) * 2;
    const halfW2 = (contentW - gridGap) / 2;

    // Row 1: Name | Email
    await drawField(page, { labelEn: 'Name',  value: permit.requester_name  || 'N/A', x: c1x,                   y: yPos, width: halfW2 });
    await drawField(page, { labelEn: 'Email', value: permit.requester_email || 'N/A', x: c1x + halfW2 + gridGap, y: yPos, width: halfW2 });
    yPos -= 32;

    // ---- Subsection 2: Contractor Details ----
    await drawSubsectionHeader(page, '2. Contractor Details', yPos, 10);
    yPos -= 22;
    await drawField(page, { labelEn: 'Company', value: permit.contractor_name || 'N/A', x: c1x,                   y: yPos, width: halfW2 });
    await drawField(page, { labelEn: 'Mobile',  value: permit.contact_mobile  || 'N/A', x: c1x + halfW2 + gridGap, y: yPos, width: halfW2 });
    yPos -= 32;

    // ---- Subsection 3: WORK DESCRIPTION ----
    await drawSubsectionHeader(page, '3. Work Description', yPos, 10);
    yPos -= 22;
    const description = String(permit.work_description || '').substring(0, 400);
    const words = description.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line + word + ' ';
      if (testLine.length > 90) {
        drawText(page, line.trim(), margin, yPos, 10, helvetica);
        yPos -= 14;
        line = word + ' ';
      } else {
        line = testLine;
      }
    }
    if (line.trim()) {
      drawText(page, line.trim(), margin, yPos, 10, helvetica);
      yPos -= 14;
    }
    yPos -= 14;

    // ---- Subsection 4: NOTES (static bilingual boilerplate) ----
    await drawSubsectionHeader(page, '4. Notes', yPos, 10);
    yPos -= 18;

    // Fixed boilerplate notes — identical on every permit. Edit here
    // to change wording. English left-aligned, Arabic right-aligned,
    // both occupying ~half the content width per row. ASCII hyphen
    // in "24-48" (not en-dash) so the English side stays WinAnsi-safe.
    const NOTES: Array<{ en: string; ar: string }> = [
      {
        en: '1. Please contact Helpdesk at 22233043 prior to commencing works and after completion of works.',
        ar: '١. يرجى الاتصال بمكتب المساعدة على الرقم 22233043 قبل البدء وبعد إنجاز الأعمال.',
      },
      {
        en: '2. Permission is granted only for the works approved above; works outside the described work above will not be permitted.',
        ar: '٢. يُمنح تصريح العمل للأعمال المعتمدة أعلاه فقط، ولا يُصرح بالأعمال خارج نطاق الوصف أعلاه.',
      },
      {
        en: '3. All Work permits require 24-48 Hrs for processing.',
        ar: '٣. كافة تصاريح العمل تحتاج 24-48 ساعة للمراجعة والاعتماد.',
      },
    ];

    const noteFontSize = 8;
    const noteLineH = 11;
    const noteHalfW = contentW / 2 - 8;
    const enColX = margin;
    const arColRightX = pageWidth - margin;

    // Greedy word-wrap by measured width.
    const wrapByWidth = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
      const ws = text.split(/\s+/);
      const lines: string[] = [];
      let cur = '';
      for (const w of ws) {
        const test = cur ? cur + ' ' + w : w;
        if (font.widthOfTextAtSize(test, size) > maxWidth && cur) {
          lines.push(cur);
          cur = w;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
      return lines;
    };

    for (const note of NOTES) {
      const enLines = wrapByWidth(note.en, helvetica, noteFontSize, noteHalfW);
      const arLines = arabicFonts
        ? wrapByWidth(note.ar, arabicFonts.regular, noteFontSize, noteHalfW)
        : [];
      const rowLines = Math.max(enLines.length, arLines.length, 1);

      for (let i = 0; i < enLines.length; i++) {
        drawText(page, enLines[i], enColX, yPos - i * noteLineH, noteFontSize, helvetica);
      }
      if (arabicFonts) {
        for (let i = 0; i < arLines.length; i++) {
          await drawArabic(page, arLines[i], arColRightX, yPos - i * noteLineH, {
            font: arabicFonts.regular,
            size: noteFontSize,
          });
        }
      }
      yPos -= rowLines * noteLineH + 6;
    }
    yPos -= 4;

    // Location / Schedule (field-grid). Respect back_of_house:
    // when true, Unit displays "Back of House"; Floor still shows real value.
    const isBOH = !!(permit as any).back_of_house;
    const unitDisplay = isBOH ? 'Back of House' : (permit.unit || 'N/A');

    // Row 3: Location | Unit | Floor
    await drawField(page, { labelEn: 'Location', value: permit.work_location || 'N/A', x: c1x, y: yPos, width: col3W });
    await drawField(page, { labelEn: 'Unit',     value: unitDisplay,                   x: c2x, y: yPos, width: col3W });
    await drawField(page, { labelEn: 'Floor',    value: permit.floor || 'N/A',         x: c3x, y: yPos, width: col3W });
    yPos -= 32;

    // Row 4: Date | Time
    const dateValue = `${formatDate(permit.work_date_from)}  -  ${formatDate(permit.work_date_to)}`;
    const timeValue = `${permit.work_time_from || 'N/A'}  -  ${permit.work_time_to || 'N/A'}`;
    const halfW = (contentW - gridGap) / 2;
    await drawField(page, { labelEn: 'Date', value: dateValue, x: c1x,                    y: yPos, width: halfW });
    await drawField(page, { labelEn: 'Time', value: timeValue, x: c1x + halfW + gridGap,  y: yPos, width: halfW });
    yPos -= 36;

    // ====================================================================
    // SECTION B — APPROVAL CHAIN
    // ====================================================================
    await drawSectionHeader(page, 'SECTION B — APPROVAL CHAIN', yPos, 11);
    yPos -= 26;


    // ====================================================================
    // Approval Chain — full-width row layout (v3 design)
    // ====================================================================
    //
    // Replaces the previous 3-column grid of cards with a single column
    // of full-width rows. Mirrors the design reference at
    // docs/design/work-permit-pdf-template.html (Section 3 — APPROVAL
    // CHAIN). Each row shows:
    //
    //   [01]  Customer Service             Sara Al-Mutairi      ✓ APPROVED   [signature]
    //         خدمة العملاء                 14 May 2026 · 10:25
    //
    // Columns (left to right):
    //   1. Number badge (32pt) — colored status dot + step number "01"
    //   2. Role + signer (260pt) — English role name (bold) over
    //      Arabic role name; signer name + date next to it
    //   3. Status pill (95pt) — colored text like 'APPROVED'
    //   4. Signature (rest) — embedded signature image, or
    //      'PENDING SIGNATURE' placeholder for pending rows

    await drawSubsectionHeader(page, '1. Approval Chain', yPos, 10);
    yPos -= 18;

    // Status colors. APPROVED = success green, REJECTED = brand red,
    // PENDING (the first not-yet-acted-upon row) = burgundy with halo,
    // AWAITING (subsequent rows) = neutral gray.
    const STATUS_OK         = rgb(0.086, 0.396, 0.204); // #166534
    const STATUS_REJECTED   = BRAND_RED;
    const STATUS_PENDING    = SUBSECTION_BAR_INK;       // burgundy
    const STATUS_AWAITING   = rgb(0.541, 0.541, 0.541); // gray
    const ROW_STROKE        = rgb(0.92, 0.92, 0.92);

    // Identify the FIRST pending row — it gets the active-pending
    // styling (filled burgundy dot + halo + PENDING label). Any
    // subsequent pending rows are shown as AWAITING (muted).
    let firstPendingIdx = -1;
    for (let i = 0; i < approvals.length; i++) {
      if (approvals[i].status === 'pending') { firstPendingIdx = i; break; }
    }

    const ROW_HEIGHT = 22;
    const CONTENT_RIGHT = pageWidth - margin;

    for (let i = 0; i < approvals.length; i++) {
      const approval = approvals[i];

      // Page-break check — if this row + footer wouldn't fit, start a
      // new page and re-render the subsection header so the chain is
      // legible if it spans pages.
      if (yPos < 90) {
        const np = createPage();
        page = np.page;
        yPos = np.yPos;
        await drawSubsectionHeader(page, '1. Approval Chain (continued)', yPos, 10);
        yPos -= 18;
      }

      const rowTop = yPos;
      const rowMid = rowTop - ROW_HEIGHT / 2;

      // Categorize status for this specific row.
      let dotColor: ReturnType<typeof rgb>;
      let pillColor: ReturnType<typeof rgb>;
      let pillLabel: string;
      let drawHalo = false;
      const isApproved = approval.status === 'approved';
      const isRejected = approval.status === 'rejected';
      const isFirstPending = i === firstPendingIdx;

      if (isApproved) {
        dotColor = STATUS_OK;
        pillColor = STATUS_OK;
        pillLabel = 'APPROVED';
      } else if (isRejected) {
        dotColor = STATUS_REJECTED;
        pillColor = STATUS_REJECTED;
        pillLabel = 'REJECTED';
      } else if (isFirstPending) {
        dotColor = STATUS_PENDING;
        pillColor = STATUS_PENDING;
        pillLabel = 'PENDING';
        drawHalo = true;
      } else {
        dotColor = STATUS_AWAITING;
        pillColor = STATUS_AWAITING;
        pillLabel = 'PENDING';
      }

      // ---- Cell 1: number badge (colored dot + step number) ----
      const dotX = margin + 8;
      const dotY = rowMid;
      if (drawHalo) {
        page.drawCircle({ x: dotX, y: dotY, size: 6, color: rgb(0.95, 0.85, 0.85) });
      }
      page.drawCircle({ x: dotX, y: dotY, size: 3, color: dotColor });
      drawText(
        page,
        String(i + 1).padStart(2, '0'),
        dotX + 7, dotY - 2, 7, helveticaBold, BRAND_DARK,
      );

      // ---- Cell 2: role name (English bold + Arabic below) + signer/date ----
      const roleX = margin + 36;
      const signerX = margin + 200;

      // English role name (top, bold). Pre-normalize dash characters so
      // names like "Coordinator – Client Relations" render as
      // "Coordinator - Client Relations" (sanitizeWinAnsi covers this,
      // but the explicit pass keeps the intent obvious).
      const englishRoleName = String(approval.name || '')
        .replace(/[\u2010-\u2015\u2212]/g, '-');
      drawText(page, englishRoleName, roleX, rowMid + 2.5, 7, helveticaBold, BRAND_DARK);

      // Arabic role name (below, smaller, RTL anchored)
      if (approval.nameAr && arabicFonts) {
        await drawArabic(page, approval.nameAr, roleX + 155, rowMid - 5, {
          font: arabicFonts.regular,
          size: 6,
          color: rgb(0.302, 0.302, 0.302),
        });
      }

      // Signer name (top)
      const signerName = (isApproved || isRejected) ? (approval.approver || '—') : '—';
      drawText(page, signerName, signerX, rowMid + 2.5, 6.5, helvetica, BRAND_DARK);

      // Date or Pending
      const dateLabel = (isApproved || isRejected) && approval.date
        ? formatDateTime(approval.date)
        : 'Pending';
      drawText(page, dateLabel, signerX, rowMid - 4.5, 6, helvetica, rgb(0.541, 0.541, 0.541));

      // ---- Cell 3: status pill (colored text — plain word, no glyphs) ----
      const pillX = pageWidth * 0.62;
      drawText(page, pillLabel, pillX, rowMid - 1, 6.5, helveticaBold, pillColor);

      // ---- Cell 4: signature (image or "AWAITING SIGNATURE" placeholder) ----
      const sigX = pageWidth * 0.78;
      const sigW = CONTENT_RIGHT - sigX - 4;

      if ((isApproved || isRejected) && approval.signature && approval.signature.startsWith('data:image')) {
        try {
          const base64Data = approval.signature.split(',')[1];
          if (base64Data) {
            const sigBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            const sigImg = approval.signature.includes('image/png')
              ? await pdfDoc.embedPng(sigBytes)
              : await pdfDoc.embedJpg(sigBytes);

            const maxW = sigW;
            const maxH = ROW_HEIGHT - 8;
            const scale = Math.min(maxW / sigImg.width, maxH / sigImg.height, 1);
            const drawW = sigImg.width * scale;
            const drawH = sigImg.height * scale;

            page.drawImage(sigImg, {
              x: sigX + (maxW - drawW) / 2,
              y: rowMid - drawH / 2,
              width: drawW,
              height: drawH,
            });
          }
        } catch (sigError) {
          console.error('Error embedding signature for', approval.name, sigError);
        }

        // Signature underline (continuous line)
        page.drawLine({
          start: { x: sigX, y: rowMid - ROW_HEIGHT / 2 + 4 },
          end: { x: sigX + sigW, y: rowMid - ROW_HEIGHT / 2 + 4 },
          thickness: 0.5,
          color: rgb(0.6, 0.6, 0.6),
        });
      } else {
        // Pending — dashed underline + "PENDING SIGNATURE" placeholder
        drawText(
          page,
          'PENDING SIGNATURE',
          sigX + 4, rowMid - 1, 6, helvetica, STATUS_AWAITING,
        );
        // Dashed line (pdf-lib doesn't natively support dashes here;
        // draw a sequence of short segments).
        const dashY = rowMid - ROW_HEIGHT / 2 + 4;
        const dashLen = 3; const gap = 2;
        for (let x = sigX; x < sigX + sigW; x += dashLen + gap) {
          page.drawLine({
            start: { x, y: dashY },
            end: { x: Math.min(x + dashLen, sigX + sigW), y: dashY },
            thickness: 0.4,
            color: rgb(0.7, 0.7, 0.7),
          });
        }
      }

      // ---- Row separator ----
      page.drawLine({
        start: { x: margin, y: rowTop - ROW_HEIGHT },
        end: { x: CONTENT_RIGHT, y: rowTop - ROW_HEIGHT },
        thickness: 0.4,
        color: ROW_STROKE,
      });

      yPos -= ROW_HEIGHT;
    }

    yPos -= 8; // breathing room after the chain

    // ====================================================================
    // (legacy 3-column grid removed — replaced by the row layout above.)
    // ====================================================================
    // Skip past the OLD rendering block: we intentionally don't filter
    // to approved/rejected anymore — the chain shows all rows so
    // viewers see the full audit trail including pending steps.
    
    // Footer (divider + "official" line + "Generated on") is drawn uniformly
    // on EVERY page inside the per-page loop below, so nothing to draw here.


    // ===== PAGE 2+: Attachment grids =====
    //
    // Two sections, each paginated as a grid:
    //
    //   1. Employee Civil ID or Driving License — 3 columns × 3 rows
    //      = 9 IDs per page. Card aspect 1.585:1 (Kuwait civil ID is
    //      85.6×53.98mm) is preserved by fitting each image to a 165×
    //      105 box inside the cell, with filename below.
    //
    //   2. Other Documents — 2 columns × 2 rows = 4 per page. Larger
    //      cells (250×340) to accommodate variable-shape documents.
    //
    // Source: permit_attachments table (modern), falls back to the
    // legacy work_permits.attachments text[] for old permits without
    // categorized rows.
    const { data: permitAttachmentRows } = await supabaseAdmin
      .from("permit_attachments")
      .select("file_path, file_name, mime_type, document_type, extracted_name, extracted_expiry_date")
      .eq("permit_id", permit.id)
      .order("created_at", { ascending: true });

    let idDocs: Array<{ path: string; name: string; mime: string | null; meta?: string }> = [];
    let otherDocs: Array<{ path: string; name: string; mime: string | null; meta?: string }> = [];

    if (permitAttachmentRows && permitAttachmentRows.length > 0) {
      for (const r of permitAttachmentRows) {
        const entry = {
          path: r.file_path as string,
          name: (r.file_name as string) || (r.file_path as string).split('/').pop() || 'attachment',
          mime: r.mime_type as string | null,
          // Surface extracted holder + expiry as a small caption under
          // the image when we have it. After OCR was removed these
          // columns are usually null; harmless when so.
          meta: [r.extracted_name, r.extracted_expiry_date].filter(Boolean).join(' · ') || undefined,
        };
        if (r.document_type === 'civil_id' || r.document_type === 'driving_license') {
          idDocs.push(entry);
        } else {
          otherDocs.push(entry);
        }
      }
    } else {
      // Legacy fallback — permit pre-dates permit_attachments table.
      // No categorization available; treat them all as "other" so they
      // still appear in the document.
      const legacy = (permit.attachments || []) as string[];
      otherDocs = legacy.map((p) => ({
        path: p,
        name: p.split('/').pop() || p,
        mime: null,
      }));
    }

    console.log(
      `[attachments] permit=${permit.id} ` +
      `permit_attachments_rows=${permitAttachmentRows?.length ?? 0} ` +
      `idDocs=${idDocs.length} otherDocs=${otherDocs.length}`,
    );

    /**
     * Download a single attachment from storage and try to embed it
     * as an image in the PDF. Returns the PDFImage on success, or
     * null if the file is missing, unreachable, or in a format
     * pdf-lib can't embed (only JPEG / PNG).
     *
     * Non-image attachments (PDFs, BMP, TIFF, etc.) are intentionally
     * returned as null so the caller falls back to a filename-only
     * placeholder cell — embedding a PDF inside a PDF would require
     * pdf-lib's copyPages() and a separate document-merge pipeline.
     */
    const tryEmbedImage = async (filePath: string, mime: string | null) => {
      try {
        const { data, error } = await supabaseAdmin.storage
          .from("permit-attachments")
          .download(filePath);
        if (error || !data) {
          console.warn(`Could not download ${filePath}:`, error?.message);
          return null;
        }
        const bytes = new Uint8Array(await data.arrayBuffer());

        // Sniff the magic bytes if MIME is missing — happens for files
        // uploaded from Safari with empty file.type
        const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
        const declaredJpeg = mime === 'image/jpeg' || mime === 'image/jpg';
        const declaredPng = mime === 'image/png';

        if (isJpeg || declaredJpeg) {
          return await pdfDoc.embedJpg(bytes);
        }
        if (isPng || declaredPng) {
          return await pdfDoc.embedPng(bytes);
        }
        // Unsupported format for embedding
        return null;
      } catch (err) {
        console.warn(`embed failed for ${filePath}:`, (err as Error).message);
        return null;
      }
    };

    /**
     * Render one page of an attachment grid.
     *   cols × rows cells, each at the given fixed size.
     *   Each cell shows: thumbnail (or filename-only fallback) +
     *   filename below + optional caption (e.g. extracted holder).
     */
    interface GridConfig {
      cols: number;
      rows: number;
      cellW: number;
      cellH: number;
      gap: number;
      sectionTitle: string;
      sectionTitleArabic?: string;
    }

    const drawAttachmentGrid = async (
      items: Array<{ path: string; name: string; mime: string | null; meta?: string }>,
      cfg: GridConfig,
    ) => {
      if (items.length === 0) return;

      const perPage = cfg.cols * cfg.rows;
      const totalGridPages = Math.ceil(items.length / perPage);

      // Observability — if a tenant complains 'PDF shows IDs one per
      // page', these logs make the cause obvious: are the items being
      // grouped correctly? Is the grid loop iterating per-page or
      // per-item? Supabase function logs surface these immediately.
      console.log(
        `[grid] section="${cfg.sectionTitle}" items=${items.length} ` +
        `cols=${cfg.cols} rows=${cfg.rows} perPage=${perPage} ` +
        `pages=${totalGridPages} cellW=${cfg.cellW} cellH=${cfg.cellH}`,
      );

      for (let pg = 0; pg < totalGridPages; pg++) {
        const { page: gridPage } = createPage();
        let headerY = pageHeight - margin;

        // SECTION C — ATTACHMENTS black banner (only on the first page
        // of the very first grid section; subsequent grid pages get
        // just the subsection bar). cfg.sectionTitle differentiates.
        await drawSectionHeader(gridPage, 'SECTION C — ATTACHMENTS', headerY, 11);
        headerY -= 28;

        // Subsection bar — burgundy "4. ATTACHED DOCUMENTS" (canonical
        // key so the AR translation resolves). The grid-specific title
        // and page indicator render as a smaller caption below.
        await drawSubsectionHeader(gridPage, '1. Attached Documents', headerY, 10);
        headerY -= 22;
        const caption = totalGridPages > 1
          ? `${cfg.sectionTitle}  (${pg + 1} of ${totalGridPages})`
          : cfg.sectionTitle;
        drawText(gridPage, caption, margin, headerY, 9, helveticaBold, BRAND_DARK);
        if (arabicFonts && cfg.sectionTitleArabic) {
          try {
            await drawArabic(gridPage, cfg.sectionTitleArabic, pageWidth - margin, headerY, {
              font: arabicFonts.regular, size: 9, color: BRAND_DARK,
            });
          } catch { /* non-fatal */ }
        }
        headerY -= 16;



        // The grid starts below the header. We center horizontally.
        const gridWidth = cfg.cols * cfg.cellW + (cfg.cols - 1) * cfg.gap;
        const gridLeft = (pageWidth - gridWidth) / 2;

        const startIdx = pg * perPage;
        const endIdx = Math.min(startIdx + perPage, items.length);

        for (let i = startIdx; i < endIdx; i++) {
          const item = items[i];
          const cellIdx = i - startIdx;
          const col = cellIdx % cfg.cols;
          const row = Math.floor(cellIdx / cfg.cols);

          const cellX = gridLeft + col * (cfg.cellW + cfg.gap);
          const cellY = headerY - (row + 1) * cfg.cellH - row * cfg.gap;

          // Reserve bottom strip for filename label
          const labelStripH = 32;
          const imgAreaH = cfg.cellH - labelStripH;
          const imgAreaW = cfg.cellW;

          // Cell border
          gridPage.drawRectangle({
            x: cellX,
            y: cellY,
            width: cfg.cellW,
            height: cfg.cellH,
            borderColor: rgb(0.75, 0.75, 0.75),
            borderWidth: 0.7,
          });

          // Try to embed the image
          const embedded = await tryEmbedImage(item.path, item.mime);

          if (embedded) {
            // Fit-inside scaling — preserve aspect ratio
            const imgRatio = embedded.width / embedded.height;
            const areaRatio = imgAreaW / imgAreaH;
            let drawW: number;
            let drawH: number;
            if (imgRatio > areaRatio) {
              drawW = imgAreaW - 8;
              drawH = drawW / imgRatio;
            } else {
              drawH = imgAreaH - 8;
              drawW = drawH * imgRatio;
            }
            const imgX = cellX + (cfg.cellW - drawW) / 2;
            const imgY = cellY + labelStripH + (imgAreaH - drawH) / 2;
            gridPage.drawImage(embedded, {
              x: imgX,
              y: imgY,
              width: drawW,
              height: drawH,
            });
          } else {
            // Filename-only fallback for non-image files (PDFs, etc.)
            const placeholderText = (item.mime || '').includes('pdf')
              ? '[PDF attachment]'
              : '[File attached]';
            const phWidth = helvetica.widthOfTextAtSize(placeholderText, 9);
            drawText(
              gridPage,
              placeholderText,
              cellX + (cfg.cellW - phWidth) / 2,
              cellY + labelStripH + imgAreaH / 2,
              9,
              helvetica,
              rgb(0.55, 0.55, 0.55),
            );
          }

          // Filename label — truncate if too long for the cell
          const truncatedName = truncateForWidth(
            item.name,
            cfg.cellW - 8,
            helvetica,
            8,
          );
          const nameWidth = helvetica.widthOfTextAtSize(truncatedName, 8);
          drawText(
            gridPage,
            truncatedName,
            cellX + (cfg.cellW - nameWidth) / 2,
            cellY + labelStripH - 12,
            8,
            helveticaBold,
            rgb(0.2, 0.2, 0.2),
          );

          // Optional caption (extracted holder name + expiry, if present)
          if (item.meta) {
            const truncatedMeta = truncateForWidth(
              item.meta,
              cfg.cellW - 8,
              helvetica,
              7,
            );
            const metaWidth = helvetica.widthOfTextAtSize(truncatedMeta, 7);
            drawText(
              gridPage,
              truncatedMeta,
              cellX + (cfg.cellW - metaWidth) / 2,
              cellY + labelStripH - 22,
              7,
              helvetica,
              rgb(0.45, 0.45, 0.45),
            );
          }
        }
      }
    };

    // 3×3 IDs grid
    //
    // Layout math: page (841.89pt) - top margin (22) - section/subsection
    // header (~66) - bottom QR/footer area (~70) = ~684pt usable. Three rows
    // of cellH=200 + 2 gaps of 8 = 616pt total grid height. Comfortably
    // fits with safe margin above the footer. (Previous cellH=220
    // pushed the third row's bottom to y=38, overlapping the QR/footer
    // — visually broken for tenants viewing the PDF.)
    await drawAttachmentGrid(idDocs, {
      cols: 3,
      rows: 3,
      cellW: 165,
      cellH: 200,
      gap: 8,
      sectionTitle: 'EMPLOYEE CIVIL ID / DRIVING LICENSE',
      sectionTitleArabic: 'البطاقة المدنية ورخصة القيادة',
    });

    // 2×2 other documents grid
    //
    // Two rows of cellH=300 + 1 gap of 12 = 612pt total grid height.
    // Same fix as above; previous cellH=340 pushed the second row's
    // bottom to y=22, completely below the footer.
    await drawAttachmentGrid(otherDocs, {
      cols: 2,
      rows: 2,
      cellW: 250,
      cellH: 300,
      gap: 12,
      sectionTitle: 'OTHER DOCUMENTS',
      sectionTitleArabic: 'مستندات أخرى',
    });
    // Add page numbers, company logo, watermark, and QR code to all pages
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
      currentPage.drawText('This is an official work permit document.', {
        x: margin, y: margin + 13, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5),
      });
      currentPage.drawText(generatedOnText, {
        x: margin, y: margin + 3, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5),
      });

      // Add QR code to footer (right side) on all pages

      if (qrCode) {
        const qrSize = 45;
        const qrX = pageWidth - margin - qrSize;
        const qrY = 20;

        const moduleCount = qrCode.getModuleCount();
        const cellSize = qrSize / moduleCount;

        // Draw modules (bottom-left origin in PDF coordinates)
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

        // Add label under QR
        const qrLabel = "Scan for permit no";
        const labelWidth = helvetica.widthOfTextAtSize(qrLabel, 6);
        currentPage.drawText(qrLabel, {
          x: qrX + (qrSize - labelWidth) / 2,
          y: qrY - 8,
          size: 6,
          font: helvetica,
          color: rgb(0.4, 0.4, 0.4),
        });

        // Add permit number below for manual verification
        const permitNo = permit.permit_no || "";
        const permitNoWidth = helvetica.widthOfTextAtSize(permitNo, 5);
        currentPage.drawText(permitNo, {
          x: qrX + (qrSize - permitNoWidth) / 2,
          y: qrY - 15,
          size: 5,
          font: helvetica,
          color: rgb(0.3, 0.3, 0.3),
        });
      }
      
      // Add page number to footer (center)
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

    const pdfBytes = await pdfDoc.save();
    console.log("PDF generated, size:", pdfBytes.length, "bytes, pages:", totalPages);

    // Upload to storage
    const fileName = `${permit.permit_no.replace(/\//g, "-")}.pdf`;
    console.log("Uploading PDF as:", fileName);
    
    const { error: uploadError } = await supabaseAdmin.storage
      .from("permit-pdfs")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
        // No caching — without this, Supabase storage's default
        // cache-control of 3600s meant tenants who triggered a
        // regenerate (e.g. after a workflow update or new attachment)
        // could be served the OLD PDF for up to an hour. Especially
        // visible during the grid-layout rollout: tenants saw the
        // pre-grid PDF cached from their previous request.
        cacheControl: "0",
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to upload PDF: " + uploadError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Generate a signed URL for the PDF (expires in 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from("permit-pdfs")
      .createSignedUrl(fileName, 3600);

    if (signedUrlError || !signedUrlData) {
      console.error("Signed URL error:", signedUrlError);
      return new Response(JSON.stringify({ error: "Failed to generate PDF URL" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("PDF signed URL generated");

    // Update the permit with the file path (not the signed URL, as it expires)
    await supabaseAdmin
      .from("work_permits")
      .update({ pdf_url: fileName })
      .eq("id", permitId);

    return new Response(
      JSON.stringify({ pdfUrl: signedUrlData.signedUrl, filePath: fileName, success: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error generating PDF:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(serve_handler);
