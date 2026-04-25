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
  notificationType: 'new_permit' | 'approval_required' | 'approved' | 'rejected' | 'rework' | 'forwarded' | 'closed' | 'sla_warning' | 'sla_breach' | 'status_update';
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
  const baseUrl = "https://hmwp.lovable.app";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  // Public URL for company logo from company-assets bucket
  const logoUrl = `${supabaseUrl}/storage/v1/object/public/company-assets/company-logo.jpg`;

  // ---- Phase 5: Al Hamra brand palette (mirrors src/index.css) ----
  // Used for the title bar, CTA button, and accent rules. Semantic
  // distinctions are preserved so a glance still tells you what kind
  // of email it is — but values come from the brand vocabulary so the
  // email feels like part of the same product as the web app.
  const BRAND_RED   = "#CD1719";   // primary identifier; rejected/breach use this
  const BRAND_DARK  = "#1D1D1B";   // body text
  const BRAND_GREY  = "#B2B2B2";   // borders, dividers
  const SUCCESS     = "#22a34a";   // approved (slightly darker than legacy for contrast on red)
  const WARNING     = "#d97706";   // SLA warning, rework, awaiting approval
  const INFO        = "#1d6fdb";   // submitted, status update
  const NEUTRAL     = "#4b5563";   // closed, archived

  // Templates: title (EN + AR), one-line content (EN + AR), accent color.
  // The notificationType drives the strip color so users can scan their
  // inbox and recognize urgency at a glance.
  type Template = {
    titleEn: string;
    titleAr: string;
    contentEn: string;
    contentAr: string;
    color: string;
  };

  const templates: Record<EmailRequest['notificationType'], Template> = {
    new_permit: {
      titleEn: "New Work Permit Submitted",
      titleAr: "تم إرسال تصريح عمل جديد",
      contentEn: `A new work permit <strong>${permitNo}</strong> has been submitted and requires your review.`,
      contentAr: `تم إرسال تصريح عمل جديد <strong>${permitNo}</strong> ويتطلب مراجعتك.`,
      color: INFO,
    },
    approval_required: {
      titleEn: "Work Permit Awaiting Your Approval",
      titleAr: "تصريح عمل بانتظار اعتمادك",
      contentEn: `Work permit <strong>${permitNo}</strong> is now pending your approval.`,
      contentAr: `تصريح العمل <strong>${permitNo}</strong> بانتظار اعتمادك.`,
      color: WARNING,
    },
    approved: {
      titleEn: "Work Permit Approved",
      titleAr: "تم اعتماد تصريح العمل",
      contentEn: `Your work permit <strong>${permitNo}</strong> has been approved by ${details.approverName || 'the approver'}.`,
      contentAr: `تم اعتماد تصريح العمل <strong>${permitNo}</strong> من قِبَل ${details.approverName || 'المعتمِد'}.`,
      color: SUCCESS,
    },
    rejected: {
      titleEn: "Work Permit Rejected",
      titleAr: "تم رفض تصريح العمل",
      contentEn: `Work permit <strong>${permitNo}</strong> has been rejected.<br><br><strong>Reason:</strong> ${details.reason || 'No reason provided'}`,
      contentAr: `تم رفض تصريح العمل <strong>${permitNo}</strong>.<br><br><strong>السبب:</strong> ${details.reason || 'لم يُذكر سبب'}`,
      color: BRAND_RED,
    },
    rework: {
      titleEn: "Work Permit Requires Rework",
      titleAr: "تصريح العمل يحتاج إلى إعادة",
      contentEn: `Work permit <strong>${permitNo}</strong> has been sent back for rework.<br><br><strong>Comments:</strong> ${details.comments || 'Please review and resubmit'}`,
      contentAr: `تمت إعادة تصريح العمل <strong>${permitNo}</strong>.<br><br><strong>الملاحظات:</strong> ${details.comments || 'يرجى المراجعة وإعادة الإرسال'}`,
      color: WARNING,
    },
    forwarded: {
      titleEn: "Work Permit Forwarded",
      titleAr: "تم تحويل تصريح العمل",
      contentEn: `Work permit <strong>${permitNo}</strong> has been forwarded to the next approval stage.`,
      contentAr: `تم تحويل تصريح العمل <strong>${permitNo}</strong> إلى مرحلة الاعتماد التالية.`,
      color: INFO,
    },
    closed: {
      titleEn: "Work Permit Closed",
      titleAr: "تم إغلاق تصريح العمل",
      contentEn: `Work permit <strong>${permitNo}</strong> has been closed.`,
      contentAr: `تم إغلاق تصريح العمل <strong>${permitNo}</strong>.`,
      color: NEUTRAL,
    },
    sla_warning: {
      titleEn: "SLA Warning — Action Required",
      titleAr: "تحذير: الموعد النهائي يقترب",
      contentEn: `Work permit <strong>${permitNo}</strong> is approaching its SLA deadline. Please take action soon.`,
      contentAr: `يقترب تصريح العمل <strong>${permitNo}</strong> من الموعد النهائي. يرجى اتخاذ الإجراء اللازم قريباً.`,
      color: WARNING,
    },
    sla_breach: {
      titleEn: "SLA Breach Alert",
      titleAr: "تنبيه: تجاوز الموعد النهائي",
      contentEn: `Work permit <strong>${permitNo}</strong> has exceeded its SLA deadline.`,
      contentAr: `تجاوز تصريح العمل <strong>${permitNo}</strong> الموعد النهائي.`,
      color: BRAND_RED,
    },
    status_update: {
      titleEn: "Work Permit Status Update",
      titleAr: "تحديث حالة تصريح العمل",
      contentEn: `Your work permit <strong>${permitNo}</strong> has been updated. ${details.statusMessage || 'It is now being processed by the next approver.'}`,
      contentAr: `تم تحديث تصريح العمل <strong>${permitNo}</strong>. ${details.statusMessageAr || 'يتم معالجته الآن من قِبَل المعتمِد التالي.'}`,
      color: INFO,
    },
  };

  const template = templates[type];
  const permitUrl = `${baseUrl}/permits/${details.permitId || ''}`;

  // ---- Brand-aligned font stack ----
  // 'Jost' renders correctly on web-mail clients that load Google Fonts
  // (Gmail web does not by default; Outlook web with custom fonts enabled
  // does). Falls back to a clean system stack otherwise. The Arabic block
  // adds Noto Kufi Arabic + system Arabic stacks so devices without it
  // still get a presentable Arabic font.
  const FONT_LATIN  = "'Jost', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const FONT_ARABIC = "'Noto Kufi Arabic', 'Geeza Pro', 'Damascus', 'Tahoma', Arial, sans-serif";

  // ---- Bilingual layout ----
  // English block on top, Arabic block below it, both inside a single
  // card. Keeps the email scannable for both audiences without forcing
  // the recipient to switch languages mid-message. The Arabic block
  // sets dir="rtl" lang="ar" so email clients render text right-to-left
  // (Outlook, Gmail, Apple Mail all handle this natively — no shaping
  // pipeline needed, unlike the PDF case).
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${template.titleEn}</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${FONT_LATIN}; background-color: #f3f4f6; color: ${BRAND_DARK};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(29, 29, 27, 0.08);">
          <!-- Brand header — logo on white -->
          <tr>
            <td style="background-color: #ffffff; padding: 24px 40px; text-align: center; border-bottom: 1px solid ${BRAND_GREY};">
              <img src="${logoUrl}" alt="Al Hamra" style="max-height: 60px; max-width: 200px;" />
            </td>
          </tr>

          <!-- Title strip — semantic accent color, white text -->
          <tr>
            <td style="background-color: ${template.color}; padding: 20px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600; font-family: ${FONT_LATIN};">${template.titleEn}</h1>
              <h1 dir="rtl" lang="ar" style="margin: 6px 0 0 0; color: #ffffff; font-size: 18px; font-weight: 500; font-family: ${FONT_ARABIC};">${template.titleAr}</h1>
            </td>
          </tr>

          <!-- English content -->
          <tr>
            <td style="padding: 32px 40px 16px 40px;">
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: ${BRAND_DARK};">
                ${template.contentEn}
              </p>
            </td>
          </tr>

          <!-- Arabic content -->
          <tr>
            <td dir="rtl" lang="ar" style="padding: 0 40px 24px 40px; font-family: ${FONT_ARABIC};">
              <p style="margin: 0; font-size: 16px; line-height: 1.8; color: ${BRAND_DARK};">
                ${template.contentAr}
              </p>
            </td>
          </tr>

          <!-- Permit details box (rendered if workType supplied) -->
          ${details.workType ? `
          <tr>
            <td style="padding: 0 40px 24px 40px;">
              <table style="width: 100%; background-color: #f9fafb; border-radius: 6px; padding: 16px; border-left: 3px solid ${BRAND_RED};">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em;">Work Type · <span dir="rtl" lang="ar" style="font-family: ${FONT_ARABIC}; text-transform: none; letter-spacing: 0;">نوع العمل</span></p>
                    <p style="margin: 0; font-size: 16px; color: ${BRAND_DARK}; font-weight: 500;">${details.workType}</p>
                  </td>
                </tr>
                ${details.requesterName ? `
                <tr>
                  <td style="padding-top: 12px;">
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em;">Requester · <span dir="rtl" lang="ar" style="font-family: ${FONT_ARABIC}; text-transform: none; letter-spacing: 0;">مقدم الطلب</span></p>
                    <p style="margin: 0; font-size: 16px; color: ${BRAND_DARK}; font-weight: 500;">${details.requesterName}</p>
                  </td>
                </tr>
                ` : ''}
                ${details.urgency ? `
                <tr>
                  <td style="padding-top: 12px;">
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em;">Priority · <span dir="rtl" lang="ar" style="font-family: ${FONT_ARABIC}; text-transform: none; letter-spacing: 0;">الأولوية</span></p>
                    <p style="margin: 0; font-size: 16px; color: ${details.urgency === 'urgent' ? BRAND_RED : BRAND_DARK}; font-weight: 500;">${details.urgency === 'urgent' ? '🚨 URGENT · عاجل' : 'Normal · عادي'}</p>
                  </td>
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- CTA -->
          <tr>
            <td style="padding: 0 40px 32px 40px; text-align: center;">
              <a href="${permitUrl}" style="display: inline-block; padding: 14px 36px; background-color: ${BRAND_RED}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; font-family: ${FONT_LATIN};">
                View Permit Details
              </a>
              <div dir="rtl" lang="ar" style="margin-top: 8px; font-family: ${FONT_ARABIC}; font-size: 13px; color: #6b7280;">
                <a href="${permitUrl}" style="color: ${BRAND_RED}; text-decoration: none;">عرض تفاصيل التصريح</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid ${BRAND_GREY};">
              <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center; line-height: 1.6;">
                This is an automated notification from the Al Hamra Work Permit System.<br>
                Please do not reply to this email.
              </p>
              <p dir="rtl" lang="ar" style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280; text-align: center; font-family: ${FONT_ARABIC}; line-height: 1.8;">
                هذا إشعار تلقائي من نظام تصاريح العمل في الحمراء.<br>
                يرجى عدم الرد على هذا البريد.
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
