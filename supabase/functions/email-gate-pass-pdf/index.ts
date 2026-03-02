import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Get Microsoft Graph access token
async function getMicrosoftToken(): Promise<string> {
  const tenantId = Deno.env.get("MS_TENANT_ID");
  const clientId = Deno.env.get("MS_CLIENT_ID");
  const clientSecret = Deno.env.get("MS_CLIENT_SECRET");

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft 365 credentials not configured");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Token error:", error);
    throw new Error(`Failed to get Microsoft token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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

    const { gatePassId, recipientEmail, recipientName } = await req.json();
    if (!gatePassId || !recipientEmail) {
      return new Response(JSON.stringify({ error: "Gate pass ID and recipient email are required" }), {
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

    // Auth check
    const isRequester = gp.requester_id === user.id;
    const { data: isApproverResult } = await supabaseAdmin.rpc("is_gate_pass_approver", { _user_id: user.id });
    const { data: isAdminResult } = await supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isRequester && !isApproverResult && !isAdminResult) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Download the PDF from storage
    const pdfFileName = gp.pdf_url || `gate-pass-${gp.pass_no.replace(/\//g, "-")}.pdf`;
    const { data: pdfData, error: pdfError } = await supabaseAdmin.storage
      .from("permit-pdfs")
      .download(pdfFileName);

    if (pdfError || !pdfData) {
      console.error("PDF download error:", pdfError);
      return new Response(JSON.stringify({ error: "Gate pass PDF not found. Please generate the PDF first." }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
    const pdfBase64 = uint8ArrayToBase64(pdfBytes);

    console.log("PDF loaded for email, size:", pdfBytes.length, "bytes");

    // Get company logo URL for email
    const logoUrl = `${supabaseUrl}/storage/v1/object/public/company-assets/company-logo.jpg`;
    const baseUrl = "https://hmwp.lovable.app";

    // Build email HTML
    const categoryLabel = gp.pass_category === "detailed_material_pass" ? "Detailed Material Pass" : "Generic Delivery Permit";
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gate Pass - ${gp.pass_no}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Logo Header -->
          <tr>
            <td style="background-color: #ffffff; padding: 24px 40px; text-align: center; border-bottom: 1px solid #e5e7eb;">
              <img src="${logoUrl}" alt="Al Hamra" style="max-height: 60px; max-width: 200px;" />
            </td>
          </tr>
          
          <!-- Title -->
          <tr>
            <td style="background-color: #1e40af; padding: 24px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Material Gate Pass</h1>
              <p style="margin: 8px 0 0 0; color: #bfdbfe; font-size: 14px;">${gp.pass_no} - ${categoryLabel}</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #374151;">
                Dear ${recipientName || "Client Representative"},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #374151;">
                Please find attached the approved gate pass <strong>${gp.pass_no}</strong> for your records. The PDF document includes all details, item listings, and approval signatures.
              </p>
              
              <!-- Gate Pass Summary -->
              <table style="width: 100%; margin: 20px 0; background-color: #f9fafb; border-radius: 8px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 13px; color: #6b7280;">Pass Number</p>
                    <p style="margin: 4px 0 0 0; font-size: 15px; color: #111827; font-weight: 600;">${gp.pass_no}</p>
                  </td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 13px; color: #6b7280;">Status</p>
                    <p style="margin: 4px 0 0 0; font-size: 15px; color: #22c55e; font-weight: 600;">${(gp.status || "").toUpperCase().replace(/_/g, " ")}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px;">
                    <p style="margin: 0; font-size: 13px; color: #6b7280;">Requestor</p>
                    <p style="margin: 4px 0 0 0; font-size: 15px; color: #111827;">${gp.requester_name}</p>
                  </td>
                  <td style="padding: 12px 16px;">
                    <p style="margin: 0; font-size: 13px; color: #6b7280;">Date</p>
                    <p style="margin: 4px 0 0 0; font-size: 15px; color: #111827;">${new Date(gp.date_of_request).toLocaleDateString()}</p>
                  </td>
                </tr>
              </table>

              <div style="text-align: center; margin-top: 30px;">
                <a href="${baseUrl}/gate-passes/${gp.id}" style="display: inline-block; padding: 14px 32px; background-color: #1e40af; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  View Gate Pass Online
                </a>
              </div>

              <p style="margin: 30px 0 0 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                <strong>Note:</strong> The gate pass PDF is attached to this email for your convenience. Please present this document at the security checkpoint.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">
                This is an automated notification from the Al Hamra Work Permit System.<br>
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Send email via Microsoft Graph with attachment
    const accessToken = await getMicrosoftToken();
    const fromEmail = Deno.env.get("MS_SENDER_EMAIL") || "rkilani@alhamra.com.kw";

    const emailPayload = {
      message: {
        subject: `Gate Pass ${gp.pass_no} - ${categoryLabel}`,
        body: {
          contentType: "HTML",
          content: emailHtml,
        },
        toRecipients: [
          { emailAddress: { address: recipientEmail } },
        ],
        attachments: [
          {
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: `${gp.pass_no.replace(/\//g, "-")}.pdf`,
            contentType: "application/pdf",
            contentBytes: pdfBase64,
          },
        ],
      },
      saveToSentItems: false,
    };

    const emailResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${fromEmail}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailPayload),
      }
    );

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Email send error:", errorText);
      throw new Error(`Failed to send email: ${emailResponse.status}`);
    }

    console.log("Gate pass PDF emailed successfully to:", recipientEmail);

    return new Response(
      JSON.stringify({ success: true, message: `Gate pass PDF emailed to ${recipientEmail}` }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error emailing gate pass PDF:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
