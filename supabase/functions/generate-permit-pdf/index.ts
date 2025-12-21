import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { permitId }: GeneratePdfRequest = await req.json();
    console.log("Generating PDF for permit:", permitId);

    if (!permitId) {
      return new Response(JSON.stringify({ error: "Permit ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch the permit details
    const { data: permit, error: permitError } = await supabase
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

    console.log("Permit found:", permit.permit_no, "Status:", permit.status);

    // Generate the PDF
    const pdfBytes = await generatePdf(permit);

    // Upload to storage
    const fileName = `${permit.permit_no.replace(/\//g, "-")}.pdf`;
    console.log("Uploading PDF as:", fileName);
    
    const { error: uploadError } = await supabase.storage
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

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from("permit-pdfs")
      .getPublicUrl(fileName);

    console.log("PDF URL:", urlData.publicUrl);

    // Update the permit with the PDF URL
    await supabase
      .from("work_permits")
      .update({ pdf_url: urlData.publicUrl })
      .eq("id", permitId);

    return new Response(
      JSON.stringify({ pdfUrl: urlData.publicUrl, success: true }),
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

async function generatePdf(permit: any): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const { width, height } = page.getSize();
  const margin = 50;
  let yPos = height - margin;
  
  const drawText = (text: string, x: number, y: number, size: number, font = helvetica, color = rgb(0, 0, 0)) => {
    page.drawText(text || '', { x, y, size, font, color });
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
  drawText(`Status: ${statusText}`, margin, yPos, 12, helveticaBold, statusColor);
  yPos -= 20;
  drawText(`Work Type: ${workType}`, margin, yPos, 11, helvetica);
  yPos -= 30;
  
  drawLine(yPos);
  yPos -= 25;
  
  // Work Description
  drawText('WORK DESCRIPTION', margin, yPos, 12, helveticaBold);
  yPos -= 18;
  const description = (permit.work_description || '').substring(0, 200);
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
  drawText(`Name: ${permit.requester_name || 'N/A'}`, col1, yPos, 10, helvetica);
  drawText(`Company: ${permit.contractor_name || 'N/A'}`, col2, yPos, 10, helvetica);
  yPos -= 14;
  drawText(`Email: ${permit.requester_email || 'N/A'}`, col1, yPos, 10, helvetica);
  drawText(`Contact: ${permit.contact_mobile || 'N/A'}`, col2, yPos, 10, helvetica);
  yPos -= 25;
  
  // Location & Schedule
  drawText('LOCATION', col1, yPos, 11, helveticaBold);
  drawText('SCHEDULE', col2, yPos, 11, helveticaBold);
  yPos -= 18;
  drawText(`Location: ${permit.work_location || 'N/A'}`, col1, yPos, 10, helvetica);
  drawText(`Date: ${formatDate(permit.work_date_from)} - ${formatDate(permit.work_date_to)}`, col2, yPos, 10, helvetica);
  yPos -= 14;
  drawText(`Unit: ${permit.unit || 'N/A'}, Floor: ${permit.floor || 'N/A'}`, col1, yPos, 10, helvetica);
  drawText(`Time: ${permit.work_time_from || 'N/A'} - ${permit.work_time_to || 'N/A'}`, col2, yPos, 10, helvetica);
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
    { name: 'Soft Facilities', status: permit.soft_facilities_status, approver: permit.soft_facilities_approver_name, date: permit.soft_facilities_date },
    { name: 'Hard Facilities', status: permit.hard_facilities_status, approver: permit.hard_facilities_approver_name, date: permit.hard_facilities_date },
    { name: 'PM Service', status: permit.pm_service_status, approver: permit.pm_service_approver_name, date: permit.pm_service_date },
  ];
  
  for (const approval of approvals) {
    if (approval.status === 'approved' || approval.status === 'rejected') {
      const statusColor = approval.status === 'approved' ? rgb(0.13, 0.77, 0.37) : rgb(0.86, 0.21, 0.27);
      const statusSymbol = approval.status === 'approved' ? '✓' : '✗';
      drawText(`${statusSymbol} ${approval.name}`, margin, yPos, 10, helveticaBold, statusColor);
      drawText(`by ${approval.approver || 'N/A'} on ${formatDateTime(approval.date)}`, margin + 120, yPos, 9, helvetica, rgb(0.4, 0.4, 0.4));
      yPos -= 16;
      
      if (yPos < 80) break; // Prevent overflow
    }
  }
  
  // Footer
  yPos = 40;
  drawLine(yPos + 10);
  drawText(`Generated on ${new Date().toLocaleString()}`, margin, yPos - 5, 8, helvetica, rgb(0.5, 0.5, 0.5));
  drawText('This is an official work permit document.', width - margin - 180, yPos - 5, 8, helvetica, rgb(0.5, 0.5, 0.5));
  
  return await pdfDoc.save();
}

serve(serve_handler);
