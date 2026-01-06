import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting for email sending
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_EMAILS_PER_WINDOW = 20;
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkEmailRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  
  if (record.count >= MAX_EMAILS_PER_WINDOW) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  record.count++;
  return { allowed: true };
}

interface EmailRequest {
  to: string[];
  subject: string;
  body: string;
  permitId?: string;
  notificationType: 'new_permit' | 'approval_required' | 'approved' | 'rejected' | 'rework' | 'forwarded' | 'closed' | 'sla_warning' | 'sla_breach';
}

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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
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

// Send email via Microsoft Graph API
async function sendEmail(accessToken: string, to: string[], subject: string, body: string, senderEmail?: string): Promise<void> {
  // Use a configured sender or the first admin email
  const fromEmail = senderEmail || Deno.env.get("MS_SENDER_EMAIL") || "rkilani@alhamra.com.kw";
  
  const emailPayload = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: body,
      },
      toRecipients: to.map(email => ({
        emailAddress: { address: email },
      })),
    },
    saveToSentItems: false,
  };

  // Using /users/{user-id}/sendMail for application permissions
  const response = await fetch(
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

  if (!response.ok) {
    const error = await response.text();
    console.error("Send email error:", error);
    throw new Error(`Failed to send email: ${response.status} - ${error}`);
  }
}

// Generate email HTML template
function generateEmailHtml(type: EmailRequest['notificationType'], permitNo: string, details: Record<string, string>): string {
  const baseUrl = "https://hmwp.lovable.dev";
  
  const templates: Record<EmailRequest['notificationType'], { title: string; content: string; color: string }> = {
    new_permit: {
      title: "New Work Permit Submitted",
      content: `A new work permit <strong>${permitNo}</strong> has been submitted and requires your review.`,
      color: "#3b82f6",
    },
    approval_required: {
      title: "Work Permit Awaiting Your Approval",
      content: `Work permit <strong>${permitNo}</strong> is now pending your approval.`,
      color: "#f59e0b",
    },
    approved: {
      title: "Work Permit Approved",
      content: `Your work permit <strong>${permitNo}</strong> has been approved by ${details.approverName || 'the approver'}.`,
      color: "#22c55e",
    },
    rejected: {
      title: "Work Permit Rejected",
      content: `Work permit <strong>${permitNo}</strong> has been rejected.<br><br><strong>Reason:</strong> ${details.reason || 'No reason provided'}`,
      color: "#ef4444",
    },
    rework: {
      title: "Work Permit Requires Rework",
      content: `Work permit <strong>${permitNo}</strong> has been sent back for rework.<br><br><strong>Comments:</strong> ${details.comments || 'Please review and resubmit'}`,
      color: "#f59e0b",
    },
    forwarded: {
      title: "Work Permit Forwarded",
      content: `Work permit <strong>${permitNo}</strong> has been forwarded to the next approval stage.`,
      color: "#8b5cf6",
    },
    closed: {
      title: "Work Permit Closed",
      content: `Work permit <strong>${permitNo}</strong> has been closed.`,
      color: "#6b7280",
    },
    sla_warning: {
      title: "SLA Warning - Action Required",
      content: `Work permit <strong>${permitNo}</strong> is approaching its SLA deadline. Please take action soon.`,
      color: "#f59e0b",
    },
    sla_breach: {
      title: "SLA Breach Alert",
      content: `Work permit <strong>${permitNo}</strong> has exceeded its SLA deadline.`,
      color: "#ef4444",
    },
  };

  const template = templates[type];
  const permitUrl = `${baseUrl}/permits/${details.permitId || ''}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${template.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${template.color}; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${template.title}</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #374151;">
                ${template.content}
              </p>
              
              ${details.workType ? `
              <table style="width: 100%; margin: 20px 0; background-color: #f9fafb; border-radius: 8px; padding: 16px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Work Type</p>
                    <p style="margin: 0; font-size: 16px; color: #111827; font-weight: 500;">${details.workType}</p>
                  </td>
                </tr>
                ${details.requesterName ? `
                <tr>
                  <td style="padding-top: 12px;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Requester</p>
                    <p style="margin: 0; font-size: 16px; color: #111827; font-weight: 500;">${details.requesterName}</p>
                  </td>
                </tr>
                ` : ''}
                ${details.urgency ? `
                <tr>
                  <td style="padding-top: 12px;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Priority</p>
                    <p style="margin: 0; font-size: 16px; color: ${details.urgency === 'urgent' ? '#ef4444' : '#111827'}; font-weight: 500;">${details.urgency === 'urgent' ? '🚨 URGENT' : 'Normal'}</p>
                  </td>
                </tr>
                ` : ''}
              </table>
              ` : ''}
              
              <div style="text-align: center; margin-top: 30px;">
                <a href="${permitUrl}" style="display: inline-block; padding: 14px 32px; background-color: ${template.color}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  View Permit Details
                </a>
              </div>
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
</html>
`;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, subject, body, permitId, notificationType, permitNo, details } = await req.json();

    // Rate limit by permit ID or a global key for system emails
    const rateLimitKey = permitId || "system";
    const rateLimitResult = checkEmailRateLimit(rateLimitKey);
    if (!rateLimitResult.allowed) {
      console.warn("Rate limit exceeded for email sending:", rateLimitKey);
      return new Response(
        JSON.stringify({ error: "Too many email requests. Please wait before sending more." }),
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

    console.log(`Sending ${notificationType} email to:`, to);

    // Get Microsoft access token
    const accessToken = await getMicrosoftToken();

    // Generate email body if not provided
    const emailBody = body || generateEmailHtml(notificationType, permitNo || 'N/A', details || {});

    // Send the email
    await sendEmail(accessToken, to, subject, emailBody);

    console.log("Email sent successfully");

    // Log to activity if permitId provided
    if (permitId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await supabase.from("activity_logs").insert({
        permit_id: permitId,
        action: "Email Notification Sent",
        performed_by: "System",
        details: `${notificationType} email sent to ${to.join(", ")}`,
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
