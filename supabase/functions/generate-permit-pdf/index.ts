import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, degrees } from "https://esm.sh/pdf-lib@1.17.1";
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
    
    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 50;
    
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

    const drawText = (page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont = helvetica, color = rgb(0, 0, 0)) => {
      const safeText = String(text || '').replace(/[^\x00-\x7F]/g, '');
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

    const formatDate = (date: string) => date ? new Date(date).toLocaleDateString() : 'N/A';
    const formatDateTime = (date: string | null | undefined) => date ? new Date(date).toLocaleString() : 'N/A';
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

      // Create the public verification URL (points to /status for unauthenticated access)
      const verificationUrl = `https://hmwp.lovable.app/status?permit=${encodeURIComponent(permitNoForQr)}`;
      
      qrCode = qrcode(0, "M");
      qrCode.addData(verificationUrl);
      qrCode.make();

      console.log("QR code matrix generated for permit number:", permitNoForQr);
    } catch (qrError) {
      console.error("Error generating QR code:", qrError);
    }

    // Header with logo
    if (companyLogo) {
      // Scale logo to fit header (max height 50px)
      const maxLogoHeight = 50;
      const maxLogoWidth = 120;
      const logoScale = Math.min(maxLogoWidth / companyLogo.width, maxLogoHeight / companyLogo.height, 1);
      const logoWidth = companyLogo.width * logoScale;
      const logoHeight = companyLogo.height * logoScale;
      
      // Draw logo on the right side of header
      page.drawImage(companyLogo, {
        x: pageWidth - margin - logoWidth,
        y: yPos - logoHeight + 10,
        width: logoWidth,
        height: logoHeight,
      });
    }
    
    // ---- Bilingual title block (v3 design) ----
    // Layout: Arabic title large at top-left, English title directly
    // beneath at smaller size. Matches docs/design/work-permit-pdf-template.html.
    // The previous look (English left + Arabic right on the same baseline)
    // is replaced because the Hot Works form reference establishes
    // Arabic-primary stacked-bilingual as the official Al Hamra layout.
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
    yPos -= 20;

    // ---- Phase 2c-3: approvals sourced from the permit_approvals table ----
    // Moved above the status badge so the badge logic (which derives
    // 'APPROVED / AWAITING X' from the approvals array) can read it
    // without hitting a temporal-dead-zone ReferenceError.
    const ROLE_DISPLAY_NAMES: Record<string, string> = {
      customer_service: 'Customer Service',
      cr_coordinator: 'CR Coordinator',
      head_cr: 'Head CR',
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
      roleKey: string;
      status: string | null;
      approver: string | null;
      date: string | null;
      signature: string | null;
      comments: string | null;
    };

    let approvals: ApprovalRow[] = [];

    const { data: approvalRows, error: approvalsErr } = await supabaseAdmin
      .from('permit_approvals')
      .select('role_name, status, approver_name, approved_at, signature, comments')
      .eq('permit_id', permitId);

    if (approvalsErr) {
      console.error('permit_approvals fetch error:', approvalsErr);
    }

    if (approvalRows && approvalRows.length > 0) {
      approvals = approvalRows.map((r): ApprovalRow => ({
        name: ROLE_DISPLAY_NAMES[r.role_name] ?? r.role_name,
        roleKey: r.role_name,
        status: r.status,
        approver: r.approver_name,
        date: r.approved_at,
        signature: r.signature,
        comments: r.comments,
      }));
    } else {
      const p = permit as Record<string, unknown>;
      for (const roleKey of ROLE_RENDER_ORDER) {
        const status = p[`${roleKey}_status`] as string | null | undefined;
        if (status !== 'approved' && status !== 'rejected') continue;
        approvals.push({
          name: ROLE_DISPLAY_NAMES[roleKey],
          roleKey,
          status,
          approver: (p[`${roleKey}_approver_name`] as string | null) ?? null,
          date: (p[`${roleKey}_date`] as string | null) ?? null,
          signature: (p[`${roleKey}_signature`] as string | null) ?? null,
          comments: (p[`${roleKey}_comments`] as string | null) ?? null,
        });
      }
    }

    approvals.sort((a, b) => {
      const oa = ROLE_ORDER_INDEX[a.roleKey] ?? Number.POSITIVE_INFINITY;
      const ob = ROLE_ORDER_INDEX[b.roleKey] ?? Number.POSITIVE_INFINITY;
      return oa - ob;
    });

    // Status badge.
    //
    // Don't trust permit.status blindly: in workflows where multiple
    // approvers must act, the work_permits.status enum can briefly
    // read as the role-specific 'pending_X' even when several
    // approvals are already in. Showing the raw value as the headline
    // status is confusing — and showing 'APPROVED' before EVERY
    // required approver acted is incorrect.
    //
    // Derived from permit_approvals (the canonical source — same
    // table the inbox + progress sidebar read from):
    //
    //   - any rejected row  -> REJECTED
    //   - all approved/none pending -> APPROVED
    //   - some pending      -> AWAITING <role(s)>
    //   - terminal but no rows (draft / cancelled) -> use permit.status
    const humanizeRole = (r: string): string =>
      (ROLE_DISPLAY_NAMES[r] ?? r)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const pendingRoles = approvals
      .filter((a) => a.status === 'pending')
      .map((a) => humanizeRole(a.roleKey));
    const anyRejected = approvals.some((a) => a.status === 'rejected');
    const anyApproved = approvals.some((a) => a.status === 'approved');

    let statusText: string;
    let statusColor: ReturnType<typeof rgb>;

    if (permit.status === 'draft' || permit.status === 'cancelled') {
      // Pre-workflow or withdrawn — show raw status, neutral color.
      statusText = (permit.status || 'unknown').toUpperCase();
      statusColor = rgb(0.42, 0.45, 0.5);
    } else if (anyRejected || permit.status === 'rejected') {
      statusText = 'REJECTED';
      statusColor = BRAND_RED;
    } else if (pendingRoles.length === 0 && anyApproved) {
      // No pending rows AND at least one approved -> fully approved.
      statusText = 'APPROVED';
      statusColor = rgb(0.13, 0.77, 0.37);
    } else if (pendingRoles.length > 0) {
      // In progress — list who's holding it now (max 2 named, then "+N more")
      const shown = pendingRoles.slice(0, 2).join(', ');
      const extra = pendingRoles.length > 2
        ? ` (+${pendingRoles.length - 2} more)`
        : '';
      statusText = `AWAITING ${shown}${extra}`;
      statusColor = rgb(0.95, 0.6, 0.07); // amber — work-in-progress
    } else {
      // Fallback (rare: workflow_steps exist but no permit_approvals
      // rows — shouldn't happen post-Phase-2c-5a, but guard anyway).
      statusText = (permit.status || 'unknown').toUpperCase();
      statusColor = rgb(0.42, 0.45, 0.5);
    }
    drawText(page, 'Status: ' + statusText, margin, yPos, 12, helveticaBold, statusColor);
    yPos -= 20;
    drawText(page, 'Work Type: ' + workType, margin, yPos, 11, helvetica, BRAND_DARK);
    yPos -= 30;
    
    drawLine(page, yPos);
    yPos -= 25;
    
    // Work Description
    await drawSectionHeader(page, 'WORK DESCRIPTION', yPos, 11);
    yPos -= 24;
    const description = String(permit.work_description || '').substring(0, 200);
    const words = description.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line + word + ' ';
      if (testLine.length > 80) {
        drawText(page, line.trim(), margin, yPos, 10, helvetica);
        yPos -= 14;
        line = word + ' ';
      } else {
        line = testLine;
      }
    }
    if (line.trim()) {
      drawText(page, line.trim(), margin, yPos, 10, helvetica);
      yPos -= 20;
    }
    
    yPos -= 10;
    drawLine(page, yPos);
    yPos -= 25;
    
    // Two column layout
    const col1 = margin;
    const col2 = pageWidth / 2 + 10;

    // Parties subsection bar (single bar spanning width, columns below).
    // Replaces the previous two parallel red text headers; aligns with
    // the v3 design where each numbered subsection has one banner.
    await drawSubsectionHeader(page, '1. CLIENT / CONTRACTOR DETAILS', yPos, 10);
    yPos -= 22;
    drawText(page, 'REQUESTER', col1, yPos, 9, helveticaBold, BRAND_DARK);
    drawText(page, 'CONTRACTOR', col2, yPos, 9, helveticaBold, BRAND_DARK);
    yPos -= 14;
    drawText(page, 'Name: ' + (permit.requester_name || 'N/A'), col1, yPos, 10, helvetica);
    drawText(page, 'Company: ' + (permit.contractor_name || 'N/A'), col2, yPos, 10, helvetica);
    yPos -= 14;
    drawText(page, 'Email: ' + (permit.requester_email || 'N/A'), col1, yPos, 10, helvetica);
    drawText(page, 'Contact: ' + (permit.contact_mobile || 'N/A'), col2, yPos, 10, helvetica);
    yPos -= 25;
    
    // Location & Schedule
    drawText(page, 'LOCATION', col1, yPos, 11, helveticaBold, BRAND_RED);
    drawText(page, 'SCHEDULE', col2, yPos, 11, helveticaBold, BRAND_RED);
    if (arabicFonts) {
      await drawArabic(page, arabicLabel('LOCATION') ?? '', col1 + 175, yPos - 9, {
        font: arabicFonts.regular, size: 8, color: BRAND_RED,
      });
      await drawArabic(page, arabicLabel('SCHEDULE') ?? '', col2 + 175, yPos - 9, {
        font: arabicFonts.regular, size: 8, color: BRAND_RED,
      });
    }
    yPos -= 18;
    drawText(page, 'Location: ' + (permit.work_location || 'N/A'), col1, yPos, 10, helvetica);
    drawText(page, 'Date: ' + formatDate(permit.work_date_from) + ' - ' + formatDate(permit.work_date_to), col2, yPos, 10, helvetica);
    yPos -= 14;
    drawText(page, 'Unit: ' + (permit.unit || 'N/A') + ', Floor: ' + (permit.floor || 'N/A'), col1, yPos, 10, helvetica);
    drawText(page, 'Time: ' + (permit.work_time_from || 'N/A') + ' - ' + (permit.work_time_to || 'N/A'), col2, yPos, 10, helvetica);
    yPos -= 30;
    
    drawLine(page, yPos);
    yPos -= 25;
    
    // Approvals section with signatures - 3 per row grid layout
    await drawSectionHeader(page, 'APPROVALS & SIGNATURES', yPos, 11);
    yPos -= 26;

    // ---- Phase 2c-3: approvals sourced from the permit_approvals table ----
    // Populated by Phase 2b dual-write since 2026-04. Replaces the hardcoded
    // 13-row array that read from per-role columns on work_permits. Role
    // display names + render order preserved from the previous version.
    const ROLE_DISPLAY_NAMES: Record<string, string> = {
      customer_service: 'Customer Service',
      cr_coordinator: 'CR Coordinator',
      head_cr: 'Head CR',
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
    // Explicit render order — the PDF grid previously placed client-
    // workflow roles first, then internal roles, with FMSP final.
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
      roleKey: string;
      status: string | null;
      approver: string | null;
      date: string | null;
      signature: string | null;
      comments: string | null;
    };

    let approvals: ApprovalRow[] = [];

    const { data: approvalRows, error: approvalsErr } = await supabaseAdmin
      .from('permit_approvals')
      .select('role_name, status, approver_name, approved_at, signature, comments')
      .eq('permit_id', permitId);

    if (approvalsErr) {
      console.error('permit_approvals fetch error:', approvalsErr);
    }

    if (approvalRows && approvalRows.length > 0) {
      approvals = approvalRows.map((r): ApprovalRow => ({
        name: ROLE_DISPLAY_NAMES[r.role_name] ?? r.role_name,
        roleKey: r.role_name,
        status: r.status,
        approver: r.approver_name,
        date: r.approved_at,
        signature: r.signature,
        comments: r.comments,
      }));
    } else {
      // Fallback for legacy permits that predate Phase 2b dual-write and
      // were never reconciled. Builds the same shape from the hardcoded
      // columns so the PDF still renders for historical data. Can be
      // removed once Phase 2c-5 drops the legacy columns (any permit
      // remaining unreconciled at that point should be backfilled first).
      const p = permit as Record<string, unknown>;
      for (const roleKey of ROLE_RENDER_ORDER) {
        const status = p[`${roleKey}_status`] as string | null | undefined;
        if (status !== 'approved' && status !== 'rejected') continue;
        approvals.push({
          name: ROLE_DISPLAY_NAMES[roleKey],
          roleKey,
          status,
          approver: (p[`${roleKey}_approver_name`] as string | null) ?? null,
          date: (p[`${roleKey}_date`] as string | null) ?? null,
          signature: (p[`${roleKey}_signature`] as string | null) ?? null,
          comments: (p[`${roleKey}_comments`] as string | null) ?? null,
        });
      }
    }

    // Stable sort by the original render order so PDF layout is unchanged.
    approvals.sort((a, b) => {
      const oa = ROLE_ORDER_INDEX[a.roleKey] ?? Number.POSITIVE_INFINITY;
      const ob = ROLE_ORDER_INDEX[b.roleKey] ?? Number.POSITIVE_INFINITY;
      return oa - ob;
    });

    // Filter to only show approved/rejected approvals
    const activeApprovals = approvals.filter(a => a.status === 'approved' || a.status === 'rejected');
    
    // Grid layout: 3 columns
    const colCount = 3;
    const colWidth = (pageWidth - 2 * margin) / colCount;
    const rowHeight = 135; // Increased height for comments
    
    let colIndex = 0;
    let rowStartY = yPos;
    
    for (let i = 0; i < activeApprovals.length; i++) {
      const approval = activeApprovals[i];
      const statusColor = approval.status === 'approved' ? rgb(0.13, 0.77, 0.37) : BRAND_RED;
      const statusSymbol = approval.status === 'approved' ? '✓' : '✗';
      
      // Get audit info for IP address
      const auditInfo = auditInfoByRole.get(approval.roleKey);
      const ipAddress = auditInfo?.ip_address || 'N/A';
      
      // Calculate x position based on column
      const xPos = margin + (colIndex * colWidth);
      let cellY = rowStartY;
      
      // Draw approval box border
      page.drawRectangle({
        x: xPos,
        y: cellY - rowHeight + 10,
        width: colWidth - 10,
        height: rowHeight - 5,
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 0.5,
      });
      
      // Draw approval header with status
      drawText(page, statusSymbol + ' ' + approval.name, xPos + 5, cellY - 12, 9, helveticaBold, statusColor);
      cellY -= 24;
      
      // Approver name (truncated to fit)
      const approverName = (approval.approver || 'N/A').substring(0, 20);
      drawText(page, approverName, xPos + 5, cellY, 8, helvetica, rgb(0.3, 0.3, 0.3));
      cellY -= 11;
      
      // Date
      drawText(page, formatDateTime(approval.date), xPos + 5, cellY, 7, helvetica, rgb(0.5, 0.5, 0.5));
      cellY -= 10;
      
      // IP (truncated)
      const shortIP = ipAddress.length > 15 ? ipAddress.substring(0, 15) + '...' : ipAddress;
      drawText(page, 'IP: ' + shortIP, xPos + 5, cellY, 7, helvetica, rgb(0.5, 0.5, 0.5));
      cellY -= 11;
      
      // Comments (truncated to fit in cell)
      if (approval.comments && approval.comments.trim()) {
        const maxCommentLength = 40;
        const truncatedComment = approval.comments.trim().substring(0, maxCommentLength);
        const displayComment = truncatedComment.length < approval.comments.trim().length 
          ? truncatedComment + '...' 
          : truncatedComment;
        drawText(page, '"' + displayComment + '"', xPos + 5, cellY, 6, helvetica, rgb(0.4, 0.4, 0.4));
        cellY -= 10;
      } else {
        cellY -= 2;
      }
      
      // Embed signature image if available
      if (approval.signature && approval.signature.startsWith('data:image')) {
        try {
          const base64Data = approval.signature.split(',')[1];
          if (base64Data) {
            const signatureBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            
            let signatureImage;
            if (approval.signature.includes('image/png')) {
              signatureImage = await pdfDoc.embedPng(signatureBytes);
            } else if (approval.signature.includes('image/jpeg') || approval.signature.includes('image/jpg')) {
              signatureImage = await pdfDoc.embedJpg(signatureBytes);
            }
            
            if (signatureImage) {
              // Scale signature to fit in cell (max 80x35)
              const maxWidth = 80;
              const maxHeight = 35;
              const scale = Math.min(maxWidth / signatureImage.width, maxHeight / signatureImage.height, 1);
              const scaledWidth = signatureImage.width * scale;
              const scaledHeight = signatureImage.height * scale;
              
              page.drawImage(signatureImage, {
                x: xPos + 5,
                y: cellY - scaledHeight,
                width: scaledWidth,
                height: scaledHeight,
              });
            }
          }
        } catch (sigError) {
          console.error('Error embedding signature for', approval.name, sigError);
        }
      }
      
      // Move to next column or next row
      colIndex++;
      if (colIndex >= colCount) {
        colIndex = 0;
        rowStartY -= rowHeight;
        yPos = rowStartY;
        
        // Check if we need a new page
        if (yPos < 120) {
          const newPageResult = createPage();
          page = newPageResult.page;
          yPos = newPageResult.yPos;
          rowStartY = yPos;
          drawText(page, 'APPROVALS (continued)', margin, yPos, 12, helveticaBold);
          yPos -= 25;
          rowStartY = yPos;
        }
      }
    }
    
    // Adjust yPos after all approvals
    if (colIndex !== 0) {
      // We ended mid-row, move to next row
      yPos = rowStartY - rowHeight;
    }
    
    // Footer on first page
    drawLine(page, 50);
    drawText(page, 'Generated on ' + new Date().toLocaleString(), margin, 35, 8, helvetica, rgb(0.5, 0.5, 0.5));
    drawText(page, 'This is an official work permit document.', pageWidth - margin - 180, 35, 8, helvetica, rgb(0.5, 0.5, 0.5));

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

        // Section header — bilingual title + page indicator
        const title = totalGridPages > 1
          ? `${cfg.sectionTitle} (${pg + 1} of ${totalGridPages})`
          : cfg.sectionTitle;
        drawText(gridPage, title, margin, headerY, 16, helveticaBold, BRAND_RED);
        if (arabicFonts && cfg.sectionTitleArabic) {
          try {
            await drawArabic(
              gridPage,
              cfg.sectionTitleArabic,
              pageWidth - margin,
              headerY,
              { font: arabicFonts.bold, size: 16, color: BRAND_RED },
            );
          } catch {
            // Arabic font issue is non-fatal
          }
        }
        headerY -= 8;
        gridPage.drawLine({
          start: { x: margin, y: headerY },
          end: { x: pageWidth - margin, y: headerY },
          thickness: 1,
          color: BRAND_RED,
        });
        headerY -= 20;

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
    // 3×3 IDs grid
    //
    // Layout math: page (792pt) - top margin (50) - section header
    // (~28) - bottom QR/footer area (~70) = ~644pt usable. Three rows
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
    for (let i = 0; i < totalPages; i++) {
      const currentPage = pages[i];
      
      // Add CONFIDENTIAL watermark (diagonal across page)
      currentPage.drawText('CONFIDENTIAL', {
        x: pageWidth / 2 - 150,
        y: pageHeight / 2 - 20,
        size: 60,
        font: helveticaBold,
        color: rgb(0.9, 0.9, 0.9),
        rotate: degrees(45),
        opacity: 0.3,
      });
      
      // Add company logo to header (skip first page as it already has it)
      if (companyLogo && i > 0) {
        const maxLogoHeight = 50;
        const maxLogoWidth = 120;
        const logoScale = Math.min(maxLogoWidth / companyLogo.width, maxLogoHeight / companyLogo.height, 1);
        const logoWidth = companyLogo.width * logoScale;
        const logoHeight = companyLogo.height * logoScale;
        
        currentPage.drawImage(companyLogo, {
          x: pageWidth - margin - logoWidth,
          y: pageHeight - margin - logoHeight + 10,
          width: logoWidth,
          height: logoHeight,
        });
      }
      
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
