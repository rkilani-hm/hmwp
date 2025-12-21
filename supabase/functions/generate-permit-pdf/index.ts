import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

    // Generate the PDF content
    const pdfContent = generatePdf(permit);

    // Upload to storage
    const fileName = `${permit.permit_no.replace(/\//g, "-")}.pdf`;
    console.log("Uploading PDF as:", fileName);
    
    const { error: uploadError } = await supabase.storage
      .from("permit-pdfs")
      .upload(fileName, pdfContent, {
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

function escapeText(text: string): string {
  if (!text) return "";
  return text.replace(/[()\\]/g, " ").substring(0, 100);
}

function generatePdf(permit: any): Uint8Array {
  const encoder = new TextEncoder();
  const workType = permit.work_types?.name || "General Work";
  const status = permit.status?.toUpperCase() || "UNKNOWN";
  const formatDate = (date: string) => date ? new Date(date).toLocaleDateString() : "N/A";
  
  // Build approval section
  const approvals: string[] = [];
  if (permit.helpdesk_status === 'approved') {
    approvals.push(`Helpdesk: ${escapeText(permit.helpdesk_approver_name || 'Approved')}`);
  }
  if (permit.pm_status === 'approved') {
    approvals.push(`PM: ${escapeText(permit.pm_approver_name || 'Approved')}`);
  }
  if (permit.pd_status === 'approved') {
    approvals.push(`PD: ${escapeText(permit.pd_approver_name || 'Approved')}`);
  }
  if (permit.bdcr_status === 'approved') {
    approvals.push(`BDCR: ${escapeText(permit.bdcr_approver_name || 'Approved')}`);
  }
  if (permit.mpr_status === 'approved') {
    approvals.push(`MPR: ${escapeText(permit.mpr_approver_name || 'Approved')}`);
  }
  if (permit.it_status === 'approved') {
    approvals.push(`IT: ${escapeText(permit.it_approver_name || 'Approved')}`);
  }
  if (permit.fitout_status === 'approved') {
    approvals.push(`Fit-Out: ${escapeText(permit.fitout_approver_name || 'Approved')}`);
  }
  if (permit.soft_facilities_status === 'approved') {
    approvals.push(`Soft Facilities: ${escapeText(permit.soft_facilities_approver_name || 'Approved')}`);
  }
  if (permit.hard_facilities_status === 'approved') {
    approvals.push(`Hard Facilities: ${escapeText(permit.hard_facilities_approver_name || 'Approved')}`);
  }
  if (permit.pm_service_status === 'approved') {
    approvals.push(`PM Service: ${escapeText(permit.pm_service_approver_name || 'Approved')}`);
  }

  // Build the content stream
  let yPos = 750;
  const lineHeight = 15;
  const sectionGap = 25;
  
  let contentLines = [
    `BT`,
    `/F1 20 Tf`,
    `50 ${yPos} Td`,
    `(WORK PERMIT) Tj`,
  ];
  
  yPos -= 30;
  contentLines.push(`/F1 14 Tf`, `0 -30 Td`, `(${escapeText(permit.permit_no)}) Tj`);
  
  yPos -= 25;
  contentLines.push(`/F1 11 Tf`, `0 -25 Td`, `(Status: ${status}) Tj`);
  
  yPos -= lineHeight;
  contentLines.push(`0 -${lineHeight} Td`, `(Work Type: ${escapeText(workType)}) Tj`);
  
  // Requester section
  yPos -= sectionGap;
  contentLines.push(`/F1 12 Tf`, `0 -${sectionGap} Td`, `(REQUESTER INFORMATION) Tj`);
  contentLines.push(`/F1 10 Tf`);
  contentLines.push(`0 -${lineHeight} Td`, `(Name: ${escapeText(permit.requester_name)}) Tj`);
  contentLines.push(`0 -${lineHeight} Td`, `(Email: ${escapeText(permit.requester_email)}) Tj`);
  
  // Contractor section
  yPos -= sectionGap;
  contentLines.push(`/F1 12 Tf`, `0 -${sectionGap} Td`, `(CONTRACTOR INFORMATION) Tj`);
  contentLines.push(`/F1 10 Tf`);
  contentLines.push(`0 -${lineHeight} Td`, `(Company: ${escapeText(permit.contractor_name)}) Tj`);
  contentLines.push(`0 -${lineHeight} Td`, `(Contact: ${escapeText(permit.contact_mobile)}) Tj`);
  
  // Location section
  yPos -= sectionGap;
  contentLines.push(`/F1 12 Tf`, `0 -${sectionGap} Td`, `(LOCATION) Tj`);
  contentLines.push(`/F1 10 Tf`);
  contentLines.push(`0 -${lineHeight} Td`, `(Work Location: ${escapeText(permit.work_location)}) Tj`);
  contentLines.push(`0 -${lineHeight} Td`, `(Unit: ${escapeText(permit.unit)}, Floor: ${escapeText(permit.floor)}) Tj`);
  
  // Schedule section
  yPos -= sectionGap;
  contentLines.push(`/F1 12 Tf`, `0 -${sectionGap} Td`, `(SCHEDULE) Tj`);
  contentLines.push(`/F1 10 Tf`);
  contentLines.push(`0 -${lineHeight} Td`, `(Date: ${formatDate(permit.work_date_from)} to ${formatDate(permit.work_date_to)}) Tj`);
  contentLines.push(`0 -${lineHeight} Td`, `(Time: ${permit.work_time_from || 'N/A'} - ${permit.work_time_to || 'N/A'}) Tj`);
  
  // Work description
  yPos -= sectionGap;
  contentLines.push(`/F1 12 Tf`, `0 -${sectionGap} Td`, `(WORK DESCRIPTION) Tj`);
  contentLines.push(`/F1 10 Tf`);
  contentLines.push(`0 -${lineHeight} Td`, `(${escapeText(permit.work_description)}) Tj`);
  
  // Approvals section
  if (approvals.length > 0) {
    contentLines.push(`/F1 12 Tf`, `0 -${sectionGap} Td`, `(APPROVALS) Tj`);
    contentLines.push(`/F1 10 Tf`);
    for (const approval of approvals) {
      contentLines.push(`0 -${lineHeight} Td`, `(${approval}) Tj`);
    }
  }
  
  // Footer
  contentLines.push(`0 -${sectionGap} Td`, `(Generated: ${new Date().toLocaleString().replace(/[()\\]/g, ' ')}) Tj`);
  contentLines.push(`ET`);
  
  const contentStream = contentLines.join('\n');
  const streamLength = contentStream.length;
  
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${contentStream}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000214 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
%%EOF
`;

  return encoder.encode(pdf);
}

serve(serve_handler);
