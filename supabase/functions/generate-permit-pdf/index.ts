import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

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
    const page = pdfDoc.addPage([612, 792]); // Letter size
    
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const { width, height } = page.getSize();
    const margin = 50;
    let yPos = height - margin;
    
    const drawText = (text: string, x: number, y: number, size: number, font = helvetica, color = rgb(0, 0, 0)) => {
      // Only draw ASCII-safe text
      const safeText = String(text || '').replace(/[^\x00-\x7F]/g, '');
      if (safeText && y > 30) {
        page.drawText(safeText, { x, y, size, font, color });
      }
    };
    
    const drawLine = (y: number) => {
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
      });
    };

    const formatDate = (date: string) => date ? new Date(date).toLocaleDateString() : 'N/A';
    const formatDateTime = (date: string) => date ? new Date(date).toLocaleString() : 'N/A';
    const workType = permit.work_types?.name || 'General Work';
    
    // Header
    drawText('WORK PERMIT', margin, yPos, 24, helveticaBold);
    yPos -= 30;
    drawText(permit.permit_no || '', margin, yPos, 16, helveticaBold);
    yPos -= 25;
    
    // Status badge
    const statusText = (permit.status || 'unknown').toUpperCase();
    const statusColor = permit.status === 'approved' ? rgb(0.13, 0.77, 0.37) : 
                        permit.status === 'rejected' ? rgb(0.86, 0.21, 0.27) :
                        rgb(0.42, 0.45, 0.5);
    drawText('Status: ' + statusText, margin, yPos, 12, helveticaBold, statusColor);
    yPos -= 20;
    drawText('Work Type: ' + workType, margin, yPos, 11, helvetica);
    yPos -= 30;
    
    drawLine(yPos);
    yPos -= 25;
    
    // Work Description
    drawText('WORK DESCRIPTION', margin, yPos, 12, helveticaBold);
    yPos -= 18;
    const description = String(permit.work_description || '').substring(0, 200);
    const words = description.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line + word + ' ';
      if (testLine.length > 80) {
        drawText(line.trim(), margin, yPos, 10, helvetica);
        yPos -= 14;
        line = word + ' ';
      } else {
        line = testLine;
      }
    }
    if (line.trim()) {
      drawText(line.trim(), margin, yPos, 10, helvetica);
      yPos -= 20;
    }
    
    yPos -= 10;
    drawLine(yPos);
    yPos -= 25;
    
    // Two column layout
    const col1 = margin;
    const col2 = width / 2 + 10;
    
    // Requester Info
    drawText('REQUESTER INFORMATION', col1, yPos, 11, helveticaBold);
    drawText('CONTRACTOR INFORMATION', col2, yPos, 11, helveticaBold);
    yPos -= 18;
    drawText('Name: ' + (permit.requester_name || 'N/A'), col1, yPos, 10, helvetica);
    drawText('Company: ' + (permit.contractor_name || 'N/A'), col2, yPos, 10, helvetica);
    yPos -= 14;
    drawText('Email: ' + (permit.requester_email || 'N/A'), col1, yPos, 10, helvetica);
    drawText('Contact: ' + (permit.contact_mobile || 'N/A'), col2, yPos, 10, helvetica);
    yPos -= 25;
    
    // Location & Schedule
    drawText('LOCATION', col1, yPos, 11, helveticaBold);
    drawText('SCHEDULE', col2, yPos, 11, helveticaBold);
    yPos -= 18;
    drawText('Location: ' + (permit.work_location || 'N/A'), col1, yPos, 10, helvetica);
    drawText('Date: ' + formatDate(permit.work_date_from) + ' - ' + formatDate(permit.work_date_to), col2, yPos, 10, helvetica);
    yPos -= 14;
    drawText('Unit: ' + (permit.unit || 'N/A') + ', Floor: ' + (permit.floor || 'N/A'), col1, yPos, 10, helvetica);
    drawText('Time: ' + (permit.work_time_from || 'N/A') + ' - ' + (permit.work_time_to || 'N/A'), col2, yPos, 10, helvetica);
    yPos -= 30;
    
    drawLine(yPos);
    yPos -= 25;
    
    // Approvals section
    drawText('APPROVALS', margin, yPos, 12, helveticaBold);
    yPos -= 20;
    
    const approvals = [
      { name: 'Helpdesk', status: permit.helpdesk_status, approver: permit.helpdesk_approver_name, date: permit.helpdesk_date },
      { name: 'PM', status: permit.pm_status, approver: permit.pm_approver_name, date: permit.pm_date },
      { name: 'PD', status: permit.pd_status, approver: permit.pd_approver_name, date: permit.pd_date },
      { name: 'BDCR', status: permit.bdcr_status, approver: permit.bdcr_approver_name, date: permit.bdcr_date },
      { name: 'MPR', status: permit.mpr_status, approver: permit.mpr_approver_name, date: permit.mpr_date },
      { name: 'IT', status: permit.it_status, approver: permit.it_approver_name, date: permit.it_date },
      { name: 'Fit-Out', status: permit.fitout_status, approver: permit.fitout_approver_name, date: permit.fitout_date },
      { name: 'Ecovert Supervisor', status: permit.ecovert_supervisor_status, approver: permit.ecovert_supervisor_approver_name, date: permit.ecovert_supervisor_date },
      { name: 'PMD Coordinator', status: permit.pmd_coordinator_status, approver: permit.pmd_coordinator_approver_name, date: permit.pmd_coordinator_date },
    ];
    
    for (const approval of approvals) {
      if (approval.status === 'approved' || approval.status === 'rejected') {
        const statusColor = approval.status === 'approved' ? rgb(0.13, 0.77, 0.37) : rgb(0.86, 0.21, 0.27);
        const statusSymbol = approval.status === 'approved' ? '[APPROVED]' : '[REJECTED]';
        drawText(statusSymbol + ' ' + approval.name, margin, yPos, 10, helveticaBold, statusColor);
        drawText('by ' + (approval.approver || 'N/A') + ' on ' + formatDateTime(approval.date), margin + 140, yPos, 9, helvetica, rgb(0.4, 0.4, 0.4));
        yPos -= 16;
        
        if (yPos < 80) break; // Prevent overflow
      }
    }
    
    // Footer
    yPos = 40;
    drawLine(yPos + 10);
    drawText('Generated on ' + new Date().toLocaleString(), margin, yPos - 5, 8, helvetica, rgb(0.5, 0.5, 0.5));
    drawText('This is an official work permit document.', width - margin - 180, yPos - 5, 8, helvetica, rgb(0.5, 0.5, 0.5));
    
    const pdfBytes = await pdfDoc.save();
    console.log("PDF generated, size:", pdfBytes.length, "bytes");

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
