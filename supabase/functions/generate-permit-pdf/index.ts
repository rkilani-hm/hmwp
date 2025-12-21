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
      return new Response(JSON.stringify({ error: "Permit not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if permit is approved
    if (permit.status !== "approved" && permit.status !== "closed") {
      return new Response(
        JSON.stringify({ error: "Only approved or closed permits can generate PDFs" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Generate HTML for the PDF
    const html = generatePermitHtml(permit);

    // Convert HTML to PDF using a simple approach
    const pdfContent = generatePdfFromHtml(html, permit);

    // Upload to storage
    const fileName = `${permit.permit_no.replace(/\//g, "-")}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("permit-pdfs")
      .upload(fileName, pdfContent, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to upload PDF" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from("permit-pdfs")
      .getPublicUrl(fileName);

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

function generatePermitHtml(permit: any): string {
  const workType = permit.work_types?.name || "General Work";
  const formatDate = (date: string) => date ? new Date(date).toLocaleDateString() : "N/A";
  const formatDateTime = (date: string) => date ? new Date(date).toLocaleString() : "N/A";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Work Permit - ${permit.permit_no}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; font-size: 12px; }
        h1 { color: #1a1a1a; border-bottom: 2px solid #333; padding-bottom: 10px; }
        h2 { color: #333; margin-top: 20px; font-size: 14px; }
        .header { text-align: center; margin-bottom: 30px; }
        .status { display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: bold; }
        .status.approved { background: #22c55e; color: white; }
        .status.closed { background: #6b7280; color: white; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .section { border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 15px; }
        .section-title { font-weight: bold; margin-bottom: 10px; color: #374151; }
        .field { margin-bottom: 8px; }
        .label { color: #6b7280; font-size: 11px; }
        .value { font-weight: 500; }
        .approval-box { border: 1px solid #d1d5db; padding: 10px; margin-bottom: 10px; border-radius: 6px; }
        .approval-box.approved { border-color: #22c55e; background: #f0fdf4; }
        .signature { border-top: 1px solid #000; width: 200px; margin-top: 30px; padding-top: 5px; }
        .footer { margin-top: 40px; text-align: center; color: #6b7280; font-size: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>WORK PERMIT</h1>
        <p style="font-size: 18px; font-weight: bold;">${permit.permit_no}</p>
        <span class="status ${permit.status}">${permit.status.toUpperCase()}</span>
      </div>

      <div class="section">
        <div class="section-title">Work Details</div>
        <div class="field">
          <div class="label">Work Type</div>
          <div class="value">${workType}</div>
        </div>
        <div class="field">
          <div class="label">Description</div>
          <div class="value">${permit.work_description}</div>
        </div>
      </div>

      <div class="grid">
        <div class="section">
          <div class="section-title">Requester Information</div>
          <div class="field">
            <div class="label">Name</div>
            <div class="value">${permit.requester_name}</div>
          </div>
          <div class="field">
            <div class="label">Email</div>
            <div class="value">${permit.requester_email}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Contractor Information</div>
          <div class="field">
            <div class="label">Company</div>
            <div class="value">${permit.contractor_name}</div>
          </div>
          <div class="field">
            <div class="label">Contact</div>
            <div class="value">${permit.contact_mobile}</div>
          </div>
        </div>
      </div>

      <div class="grid">
        <div class="section">
          <div class="section-title">Location</div>
          <div class="field">
            <div class="label">Work Location</div>
            <div class="value">${permit.work_location}</div>
          </div>
          <div class="field">
            <div class="label">Unit / Floor</div>
            <div class="value">${permit.unit} / ${permit.floor}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Schedule</div>
          <div class="field">
            <div class="label">Date Range</div>
            <div class="value">${formatDate(permit.work_date_from)} to ${formatDate(permit.work_date_to)}</div>
          </div>
          <div class="field">
            <div class="label">Time</div>
            <div class="value">${permit.work_time_from} - ${permit.work_time_to}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Approvals</div>
        
        ${permit.helpdesk_status === 'approved' ? `
        <div class="approval-box approved">
          <strong>Helpdesk</strong> - Approved by ${permit.helpdesk_approver_name || 'N/A'} on ${formatDateTime(permit.helpdesk_date)}
          ${permit.helpdesk_comments ? `<p style="margin: 5px 0 0 0; font-size: 11px;">Comments: ${permit.helpdesk_comments}</p>` : ''}
        </div>
        ` : ''}

        ${permit.pm_status === 'approved' ? `
        <div class="approval-box approved">
          <strong>PM</strong> - Approved by ${permit.pm_approver_name || 'N/A'} on ${formatDateTime(permit.pm_date)}
          ${permit.pm_comments ? `<p style="margin: 5px 0 0 0; font-size: 11px;">Comments: ${permit.pm_comments}</p>` : ''}
        </div>
        ` : ''}

        ${permit.pd_status === 'approved' ? `
        <div class="approval-box approved">
          <strong>PD</strong> - Approved by ${permit.pd_approver_name || 'N/A'} on ${formatDateTime(permit.pd_date)}
          ${permit.pd_comments ? `<p style="margin: 5px 0 0 0; font-size: 11px;">Comments: ${permit.pd_comments}</p>` : ''}
        </div>
        ` : ''}

        ${permit.bdcr_status === 'approved' ? `
        <div class="approval-box approved">
          <strong>BDCR</strong> - Approved by ${permit.bdcr_approver_name || 'N/A'} on ${formatDateTime(permit.bdcr_date)}
        </div>
        ` : ''}

        ${permit.mpr_status === 'approved' ? `
        <div class="approval-box approved">
          <strong>MPR</strong> - Approved by ${permit.mpr_approver_name || 'N/A'} on ${formatDateTime(permit.mpr_date)}
        </div>
        ` : ''}

        ${permit.it_status === 'approved' ? `
        <div class="approval-box approved">
          <strong>IT</strong> - Approved by ${permit.it_approver_name || 'N/A'} on ${formatDateTime(permit.it_date)}
        </div>
        ` : ''}

        ${permit.fitout_status === 'approved' ? `
        <div class="approval-box approved">
          <strong>Fit-Out</strong> - Approved by ${permit.fitout_approver_name || 'N/A'} on ${formatDateTime(permit.fitout_date)}
        </div>
        ` : ''}

        ${permit.soft_facilities_status === 'approved' ? `
        <div class="approval-box approved">
          <strong>Soft Facilities</strong> - Approved by ${permit.soft_facilities_approver_name || 'N/A'} on ${formatDateTime(permit.soft_facilities_date)}
        </div>
        ` : ''}

        ${permit.hard_facilities_status === 'approved' ? `
        <div class="approval-box approved">
          <strong>Hard Facilities</strong> - Approved by ${permit.hard_facilities_approver_name || 'N/A'} on ${formatDateTime(permit.hard_facilities_date)}
        </div>
        ` : ''}

        ${permit.pm_service_status === 'approved' ? `
        <div class="approval-box approved">
          <strong>PM Service</strong> - Approved by ${permit.pm_service_approver_name || 'N/A'} on ${formatDateTime(permit.pm_service_date)}
        </div>
        ` : ''}
      </div>

      <div class="footer">
        <p>Generated on ${new Date().toLocaleString()}</p>
        <p>This is an official work permit document.</p>
      </div>
    </body>
    </html>
  `;
}

function generatePdfFromHtml(html: string, permit: any): Uint8Array {
  // Create a simple text-based PDF
  // Note: For production, you'd want to use a proper PDF library
  const encoder = new TextEncoder();
  
  const pdfHeader = `%PDF-1.4
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
<< /Length 6 0 R >>
stream
BT
/F1 16 Tf
50 750 Td
(WORK PERMIT) Tj
/F1 14 Tf
0 -30 Td
(${permit.permit_no}) Tj
/F1 10 Tf
0 -25 Td
(Status: ${permit.status.toUpperCase()}) Tj
0 -20 Td
(Work Type: ${permit.work_types?.name || 'General Work'}) Tj
0 -30 Td
(REQUESTER INFORMATION) Tj
0 -15 Td
(Name: ${permit.requester_name}) Tj
0 -15 Td
(Email: ${permit.requester_email}) Tj
0 -30 Td
(CONTRACTOR INFORMATION) Tj
0 -15 Td
(Company: ${permit.contractor_name}) Tj
0 -15 Td
(Contact: ${permit.contact_mobile}) Tj
0 -30 Td
(LOCATION) Tj
0 -15 Td
(Work Location: ${permit.work_location}) Tj
0 -15 Td
(Unit: ${permit.unit}, Floor: ${permit.floor}) Tj
0 -30 Td
(SCHEDULE) Tj
0 -15 Td
(Date: ${permit.work_date_from} to ${permit.work_date_to}) Tj
0 -15 Td
(Time: ${permit.work_time_from} - ${permit.work_time_to}) Tj
0 -30 Td
(WORK DESCRIPTION) Tj
0 -15 Td
(${permit.work_description.substring(0, 80)}) Tj
0 -30 Td
(Generated: ${new Date().toLocaleString()}) Tj
ET
endstream
endobj
`;

  const streamLength = pdfHeader.split('stream\n')[1].split('\nendstream')[0].length;
  
  const pdfFull = `%PDF-1.4
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
BT
/F1 16 Tf
50 750 Td
(WORK PERMIT) Tj
/F1 14 Tf
0 -30 Td
(${permit.permit_no}) Tj
/F1 10 Tf
0 -25 Td
(Status: ${permit.status.toUpperCase()}) Tj
0 -20 Td
(Work Type: ${permit.work_types?.name || 'General Work'}) Tj
0 -30 Td
(REQUESTER INFORMATION) Tj
0 -15 Td
(Name: ${permit.requester_name}) Tj
0 -15 Td
(Email: ${permit.requester_email}) Tj
0 -30 Td
(CONTRACTOR INFORMATION) Tj
0 -15 Td
(Company: ${permit.contractor_name}) Tj
0 -15 Td
(Contact: ${permit.contact_mobile}) Tj
0 -30 Td
(LOCATION) Tj
0 -15 Td
(Work Location: ${permit.work_location}) Tj
0 -15 Td
(Unit: ${permit.unit}, Floor: ${permit.floor}) Tj
0 -30 Td
(SCHEDULE) Tj
0 -15 Td
(Date: ${permit.work_date_from} to ${permit.work_date_to}) Tj
0 -15 Td
(Time: ${permit.work_time_from} - ${permit.work_time_to}) Tj
0 -30 Td
(WORK DESCRIPTION) Tj
0 -15 Td
(${permit.work_description.substring(0, 80).replace(/[()\\]/g, ' ')}) Tj
0 -30 Td
(Generated: ${new Date().toLocaleString().replace(/[()\\]/g, ' ')}) Tj
ET
endstream
endobj
6 0 obj
${streamLength}
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000214 00000 n 
trailer
<< /Size 7 /Root 1 0 R >>
startxref
%%EOF
`;

  return encoder.encode(pdfFull);
}

serve(serve_handler);
