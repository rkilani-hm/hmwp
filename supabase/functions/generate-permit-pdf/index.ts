import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, degrees } from "https://esm.sh/pdf-lib@1.17.1";
import qrcode from "https://esm.sh/qrcode-generator@1.4.4";

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
    
    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 50;
    
    // Helper functions
    const createPage = () => {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      return { page, yPos: pageHeight - margin };
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

    const formatDate = (date: string) => date ? new Date(date).toLocaleDateString() : 'N/A';
    const formatDateTime = (date: string) => date ? new Date(date).toLocaleString() : 'N/A';
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
    
    drawText(page, 'WORK PERMIT', margin, yPos, 24, helveticaBold);
    yPos -= 30;
    drawText(page, permit.permit_no || '', margin, yPos, 16, helveticaBold);
    yPos -= 25;
    
    // Status badge
    const statusText = (permit.status || 'unknown').toUpperCase();
    const statusColor = permit.status === 'approved' ? rgb(0.13, 0.77, 0.37) : 
                        permit.status === 'rejected' ? rgb(0.86, 0.21, 0.27) :
                        rgb(0.42, 0.45, 0.5);
    drawText(page, 'Status: ' + statusText, margin, yPos, 12, helveticaBold, statusColor);
    yPos -= 20;
    drawText(page, 'Work Type: ' + workType, margin, yPos, 11, helvetica);
    yPos -= 30;
    
    drawLine(page, yPos);
    yPos -= 25;
    
    // Work Description
    drawText(page, 'WORK DESCRIPTION', margin, yPos, 12, helveticaBold);
    yPos -= 18;
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
    
    // Requester Info
    drawText(page, 'REQUESTER INFORMATION', col1, yPos, 11, helveticaBold);
    drawText(page, 'CONTRACTOR INFORMATION', col2, yPos, 11, helveticaBold);
    yPos -= 18;
    drawText(page, 'Name: ' + (permit.requester_name || 'N/A'), col1, yPos, 10, helvetica);
    drawText(page, 'Company: ' + (permit.contractor_name || 'N/A'), col2, yPos, 10, helvetica);
    yPos -= 14;
    drawText(page, 'Email: ' + (permit.requester_email || 'N/A'), col1, yPos, 10, helvetica);
    drawText(page, 'Contact: ' + (permit.contact_mobile || 'N/A'), col2, yPos, 10, helvetica);
    yPos -= 25;
    
    // Location & Schedule
    drawText(page, 'LOCATION', col1, yPos, 11, helveticaBold);
    drawText(page, 'SCHEDULE', col2, yPos, 11, helveticaBold);
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
    drawText(page, 'APPROVALS & SIGNATURES', margin, yPos, 12, helveticaBold);
    yPos -= 25;
    
    const approvals = [
      // Client workflow roles
      { name: 'Customer Service', roleKey: 'customer_service', status: permit.customer_service_status, approver: permit.customer_service_approver_name, date: permit.customer_service_date, signature: permit.customer_service_signature, comments: permit.customer_service_comments },
      { name: 'CR Coordinator', roleKey: 'cr_coordinator', status: permit.cr_coordinator_status, approver: permit.cr_coordinator_approver_name, date: permit.cr_coordinator_date, signature: permit.cr_coordinator_signature, comments: permit.cr_coordinator_comments },
      { name: 'Head CR', roleKey: 'head_cr', status: permit.head_cr_status, approver: permit.head_cr_approver_name, date: permit.head_cr_date, signature: permit.head_cr_signature, comments: permit.head_cr_comments },
      // Internal workflow roles
      { name: 'Helpdesk', roleKey: 'helpdesk', status: permit.helpdesk_status, approver: permit.helpdesk_approver_name, date: permit.helpdesk_date, signature: permit.helpdesk_signature, comments: permit.helpdesk_comments },
      { name: 'PM', roleKey: 'pm', status: permit.pm_status, approver: permit.pm_approver_name, date: permit.pm_date, signature: permit.pm_signature, comments: permit.pm_comments },
      { name: 'PD', roleKey: 'pd', status: permit.pd_status, approver: permit.pd_approver_name, date: permit.pd_date, signature: permit.pd_signature, comments: permit.pd_comments },
      { name: 'BDCR', roleKey: 'bdcr', status: permit.bdcr_status, approver: permit.bdcr_approver_name, date: permit.bdcr_date, signature: permit.bdcr_signature, comments: permit.bdcr_comments },
      { name: 'MPR', roleKey: 'mpr', status: permit.mpr_status, approver: permit.mpr_approver_name, date: permit.mpr_date, signature: permit.mpr_signature, comments: permit.mpr_comments },
      { name: 'IT', roleKey: 'it', status: permit.it_status, approver: permit.it_approver_name, date: permit.it_date, signature: permit.it_signature, comments: permit.it_comments },
      { name: 'Fit-Out', roleKey: 'fitout', status: permit.fitout_status, approver: permit.fitout_approver_name, date: permit.fitout_date, signature: permit.fitout_signature, comments: permit.fitout_comments },
      { name: 'Ecovert Supervisor', roleKey: 'ecovert_supervisor', status: permit.ecovert_supervisor_status, approver: permit.ecovert_supervisor_approver_name, date: permit.ecovert_supervisor_date, signature: permit.ecovert_supervisor_signature, comments: permit.ecovert_supervisor_comments },
      { name: 'PMD Coordinator', roleKey: 'pmd_coordinator', status: permit.pmd_coordinator_status, approver: permit.pmd_coordinator_approver_name, date: permit.pmd_coordinator_date, signature: permit.pmd_coordinator_signature, comments: permit.pmd_coordinator_comments },
      // FMSP Approval (final step)
      { name: 'FMSP Approval', roleKey: 'fmsp_approval', status: permit.fmsp_approval_status, approver: permit.fmsp_approval_approver_name, date: permit.fmsp_approval_date, signature: permit.fmsp_approval_signature, comments: permit.fmsp_approval_comments },
    ];
    
    // Filter to only show approved/rejected approvals
    const activeApprovals = approvals.filter(a => a.status === 'approved' || a.status === 'rejected');
    
    // Grid layout: 3 columns
    const colCount = 3;
    const colWidth = (pageWidth - 2 * margin) / colCount;
    const rowHeight = 120; // Fixed height per approval block
    
    let colIndex = 0;
    let rowStartY = yPos;
    
    for (let i = 0; i < activeApprovals.length; i++) {
      const approval = activeApprovals[i];
      const statusColor = approval.status === 'approved' ? rgb(0.13, 0.77, 0.37) : rgb(0.86, 0.21, 0.27);
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
      cellY -= 12;
      
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

    // ===== PAGE 2+: Attachments =====
    const attachments = permit.attachments || [];
    if (attachments.length > 0) {
      console.log("Processing", attachments.length, "attachments");
      
      const attachmentPageResult = createPage();
      page = attachmentPageResult.page;
      yPos = attachmentPageResult.yPos;
      
      drawText(page, 'ATTACHMENTS', margin, yPos, 16, helveticaBold);
      yPos -= 30;
      
      for (let i = 0; i < attachments.length; i++) {
        const attachment = attachments[i];
        const fileName = attachment.split('/').pop() || attachment;
        const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
        
        console.log("Processing attachment:", fileName, "type:", fileExt);
        
        // Draw attachment name
        drawText(page, `${i + 1}. ${fileName}`, margin, yPos, 10, helveticaBold);
        yPos -= 18;
        
        // Try to embed image attachments
        const imageExts = ['jpg', 'jpeg', 'png'];
        if (imageExts.includes(fileExt)) {
          try {
            // Download attachment from storage
            const { data: attachmentData, error: downloadError } = await supabaseAdmin.storage
              .from("permit-attachments")
              .download(attachment);
            
            if (!downloadError && attachmentData) {
              const arrayBuffer = await attachmentData.arrayBuffer();
              const imageBytes = new Uint8Array(arrayBuffer);
              
              let embeddedImage;
              if (fileExt === 'png') {
                embeddedImage = await pdfDoc.embedPng(imageBytes);
              } else {
                embeddedImage = await pdfDoc.embedJpg(imageBytes);
              }
              
              // Scale image to fit page width (max 500px wide, proportional height)
              const maxWidth = 500;
              const maxHeight = 400;
              const scale = Math.min(maxWidth / embeddedImage.width, maxHeight / embeddedImage.height, 1);
              const scaledWidth = embeddedImage.width * scale;
              const scaledHeight = embeddedImage.height * scale;
              
              // Check if image fits on current page
              if (yPos - scaledHeight < 80) {
                const newPageResult = createPage();
                page = newPageResult.page;
                yPos = newPageResult.yPos;
                drawText(page, 'ATTACHMENTS (continued)', margin, yPos, 12, helveticaBold);
                yPos -= 25;
              }
              
              // Draw border around image
              page.drawRectangle({
                x: margin - 2,
                y: yPos - scaledHeight - 2,
                width: scaledWidth + 4,
                height: scaledHeight + 4,
                borderColor: rgb(0.7, 0.7, 0.7),
                borderWidth: 1,
              });
              
              page.drawImage(embeddedImage, {
                x: margin,
                y: yPos - scaledHeight,
                width: scaledWidth,
                height: scaledHeight,
              });
              
              yPos -= (scaledHeight + 25);
              console.log("Embedded image:", fileName);
            } else {
              console.error("Error downloading attachment:", downloadError);
              drawText(page, '  [Image could not be loaded]', margin, yPos, 9, helvetica, rgb(0.6, 0.6, 0.6));
              yPos -= 15;
            }
          } catch (imgError) {
            console.error("Error processing image:", imgError);
            drawText(page, '  [Error loading image]', margin, yPos, 9, helvetica, rgb(0.6, 0.6, 0.6));
            yPos -= 15;
          }
        } else {
          // Non-image attachment - just list it
          drawText(page, '  [File attached - see original]', margin, yPos, 9, helvetica, rgb(0.5, 0.5, 0.5));
          yPos -= 20;
        }
        
        // Check if we need a new page
        if (yPos < 100 && i < attachments.length - 1) {
          const newPageResult = createPage();
          page = newPageResult.page;
          yPos = newPageResult.yPos;
          drawText(page, 'ATTACHMENTS (continued)', margin, yPos, 12, helveticaBold);
          yPos -= 25;
        }
      }
    }

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
