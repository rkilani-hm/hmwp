import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 5;
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Check rate limit for user/IP combination
function checkRateLimit(userId: string, ipAddress: string): { allowed: boolean; retryAfter?: number } {
  const key = `${userId}:${ipAddress}`;
  const now = Date.now();
  
  const record = rateLimitStore.get(key);
  
  if (!record || now > record.resetTime) {
    // Reset or create new record
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  
  if (record.count >= MAX_ATTEMPTS_PER_WINDOW) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  record.count++;
  return { allowed: true };
}

// Add consistent delay to prevent timing attacks (always takes ~500ms)
async function constantTimePasswordCheck(
  supabaseUrl: string,
  supabaseAnonKey: string,
  email: string,
  password: string
): Promise<boolean> {
  const startTime = Date.now();
  const MIN_RESPONSE_TIME = 500; // Minimum 500ms response time
  
  let isValid = false;
  try {
    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const { error: signInError } = await userClient.auth.signInWithPassword({
      email,
      password,
    });
    isValid = !signInError;
  } catch {
    isValid = false;
  }
  
  // Ensure consistent response time to prevent timing attacks
  const elapsed = Date.now() - startTime;
  if (elapsed < MIN_RESPONSE_TIME) {
    await new Promise(resolve => setTimeout(resolve, MIN_RESPONSE_TIME - elapsed));
  }
  
  return isValid;
}

// Valid roles for approval workflow
const validApprovalRoles = [
  'helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 
  'it', 'fitout', 'ecovert_supervisor', 'pmd_coordinator'
] as const;

// Input validation schema
const ApprovalSchema = z.object({
  permitId: z.string()
    .uuid("Invalid permit ID format"),
  role: z.enum(validApprovalRoles, {
    errorMap: () => ({ message: "Invalid approval role" })
  }),
  comments: z.string()
    .max(1000, "Comments must be less than 1000 characters")
    .transform(val => val.trim()),
  signature: z.string()
    .max(100000, "Signature data too large")
    .nullable(),
  approved: z.boolean({
    required_error: "Approved status is required",
    invalid_type_error: "Approved must be a boolean"
  }),
  password: z.string()
    .min(1, "Password is required")
    .max(100, "Password too long"),
});

interface WorkType {
  id: string;
  name: string;
  requires_pm: boolean;
  requires_pd: boolean;
  requires_bdcr: boolean;
  requires_mpr: boolean;
  requires_it: boolean;
  requires_fitout: boolean;
  requires_ecovert_supervisor: boolean;
  requires_pmd_coordinator: boolean;
}

interface WorkLocation {
  id: string;
  name: string;
  location_type: 'shop' | 'common';
}

// Define the approval workflow order - PM and PD are location-based
const APPROVAL_ORDER = [
  { role: 'helpdesk', status: 'submitted', nextStatus: 'pending_pm', requiresField: null },
  { role: 'pm', status: 'pending_pm', nextStatus: 'pending_pd', requiresField: 'requires_pm', locationType: 'shop' },
  { role: 'pd', status: 'pending_pd', nextStatus: 'pending_bdcr', requiresField: 'requires_pd', locationType: 'common' },
  { role: 'bdcr', status: 'pending_bdcr', nextStatus: 'pending_mpr', requiresField: 'requires_bdcr' },
  { role: 'mpr', status: 'pending_mpr', nextStatus: 'pending_it', requiresField: 'requires_mpr' },
  { role: 'it', status: 'pending_it', nextStatus: 'pending_fitout', requiresField: 'requires_it' },
  { role: 'fitout', status: 'pending_fitout', nextStatus: 'pending_ecovert_supervisor', requiresField: 'requires_fitout' },
  { role: 'ecovert_supervisor', status: 'pending_ecovert_supervisor', nextStatus: 'pending_pmd_coordinator', requiresField: 'requires_ecovert_supervisor' },
  { role: 'pmd_coordinator', status: 'pending_pmd_coordinator', nextStatus: 'approved', requiresField: 'requires_pmd_coordinator' },
];

// Get the next required approval step based on work type and location
function getNextApprovalStep(
  currentRole: string, 
  workType: WorkType | null, 
  locationType: 'shop' | 'common' | null
): { nextStatus: string; nextRole: string | null } {
  const currentIndex = APPROVAL_ORDER.findIndex(step => step.role === currentRole);
  if (currentIndex === -1) {
    return { nextStatus: 'approved', nextRole: null };
  }

  // After helpdesk, route based on location type
  if (currentRole === 'helpdesk') {
    const effectiveLocationType = locationType || 'shop'; // Default to shop (PM) if no location
    if (effectiveLocationType === 'shop') {
      return { nextStatus: 'pending_pm', nextRole: 'pm' };
    } else {
      return { nextStatus: 'pending_pd', nextRole: 'pd' };
    }
  }

  // Look for the next required step
  for (let i = currentIndex + 1; i < APPROVAL_ORDER.length; i++) {
    const step = APPROVAL_ORDER[i];
    
    // Skip location-based steps that don't match
    if (step.locationType) {
      const effectiveLocationType = locationType || 'shop';
      // PM is required for shop locations (as first after helpdesk) but can also be in work type
      // PD is required for common locations (as first after helpdesk) but can also be in work type
      if (currentRole === 'pm' && step.role === 'pd') {
        // After PM, check if PD is required by work type (not just location)
        if (!workType?.requires_pd) continue;
      }
      if (currentRole === 'pd' && step.role === 'pm') {
        // This shouldn't happen in normal flow, skip
        continue;
      }
    }
    
    // If no requiresField or no workType, include the step
    if (!step.requiresField || !workType) {
      return { nextStatus: step.status, nextRole: step.role };
    }
    
    // Check if this step is required by the work type
    const isRequired = workType[step.requiresField as keyof WorkType];
    if (isRequired) {
      return { nextStatus: step.status, nextRole: step.role };
    }
  }

  // If no more required steps, the permit is approved
  return { nextStatus: 'approved', nextRole: null };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get user's auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Extract JWT token from Authorization header
    const token = authHeader.replace("Bearer ", "");
    
    // Create admin client to verify the token and get user
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      console.error("User auth error:", userError);
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    // Create user client for password verification
    const userClient = createClient(supabaseUrl, supabaseAnonKey);

    // Parse and validate request body
    const rawBody = await req.json();
    const parseResult = ApprovalSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => e.message).join(", ");
      console.error("Validation failed:", parseResult.error.errors);
      return new Response(JSON.stringify({ error: `Validation failed: ${errorMessages}` }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { permitId, role, comments, signature, approved, password } = parseResult.data;

    // Extract IP address early for rate limiting
    const ipAddress = req.headers.get("x-forwarded-for") || 
                      req.headers.get("x-real-ip") || 
                      req.headers.get("cf-connecting-ip") ||
                      "unknown";

    console.log("Processing approval for permit:", permitId, "role:", role, "approved:", approved);

    // Check rate limit before password verification
    const rateLimitResult = checkRateLimit(user.id, ipAddress);
    if (!rateLimitResult.allowed) {
      console.warn("Rate limit exceeded for user:", user.email, "IP:", ipAddress);
      return new Response(
        JSON.stringify({ 
          error: "Too many password verification attempts. Please try again later.",
          retryAfter: rateLimitResult.retryAfter 
        }), 
        {
          status: 429,
          headers: { 
            "Content-Type": "application/json", 
            "Retry-After": String(rateLimitResult.retryAfter),
            ...corsHeaders 
          },
        }
      );
    }

    // Verify password with constant-time check to prevent timing attacks
    const isPasswordValid = await constantTimePasswordCheck(supabaseUrl, supabaseAnonKey, user.email!, password);

    if (!isPasswordValid) {
      console.error("Password verification failed for user:", user.email);
      // Generic error message - don't reveal specific failure reason
      return new Response(JSON.stringify({ error: "Invalid password. Please enter your correct password to confirm approval." }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Password verified successfully for user:", user.email);
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Parse user agent for device info
    const deviceInfo = {
      platform: userAgent.includes("Windows") ? "Windows" : 
                userAgent.includes("Mac") ? "macOS" :
                userAgent.includes("Linux") ? "Linux" :
                userAgent.includes("Android") ? "Android" :
                userAgent.includes("iPhone") || userAgent.includes("iPad") ? "iOS" : "Unknown",
      browser: userAgent.includes("Chrome") ? "Chrome" :
               userAgent.includes("Firefox") ? "Firefox" :
               userAgent.includes("Safari") ? "Safari" :
               userAgent.includes("Edge") ? "Edge" : "Unknown",
      timestamp: new Date().toISOString(),
    };

    // Create a hash of the signature for audit purposes
    let signatureHash = null;
    if (signature) {
      const encoder = new TextEncoder();
      const data = encoder.encode(signature);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      signatureHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }

    // Use service role client for database operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get user profile
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const userName = profile?.full_name || user.email || "Unknown";

    // Log the signature audit
    const { error: auditError } = await serviceClient
      .from("signature_audit_logs")
      .insert({
        permit_id: permitId,
        user_id: user.id,
        user_email: user.email!,
        user_name: userName,
        role: role,
        action: approved ? "approved" : "rejected",
        ip_address: ipAddress,
        user_agent: userAgent,
        device_info: deviceInfo,
        signature_hash: signatureHash,
        password_verified: true,
      });

    if (auditError) {
      console.error("Audit log error:", auditError);
      // Don't fail the request, just log the error
    }

    console.log("Audit log created for user:", user.email, "IP:", ipAddress);

    // Get the current permit with work type and location to determine next step
    const { data: currentPermit } = await serviceClient
      .from("work_permits")
      .select(`
        *,
        work_types (
          id,
          name,
          requires_pm,
          requires_pd,
          requires_bdcr,
          requires_mpr,
          requires_it,
          requires_fitout,
          requires_ecovert_supervisor,
          requires_pmd_coordinator
        ),
        work_locations (
          id,
          name,
          location_type
        )
      `)
      .eq("id", permitId)
      .single();

    if (!currentPermit) {
      return new Response(JSON.stringify({ error: "Permit not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get location type for routing
    const workLocation = currentPermit?.work_locations as WorkLocation | null;
    const locationType = workLocation?.location_type || (currentPermit.work_location_other ? 'shop' : null);

    // Update the permit
    const roleField = role.toLowerCase().replace(" ", "_");
    const approvalStatus = approved ? "approved" : "rejected";

    const updateData: Record<string, unknown> = {
      [`${roleField}_status`]: approvalStatus,
      [`${roleField}_approver_name`]: userName,
      [`${roleField}_approver_email`]: user.email,
      [`${roleField}_date`]: new Date().toISOString(),
      [`${roleField}_comments`]: comments,
      [`${roleField}_signature`]: signature,
    };

    if (!approved) {
      updateData.status = "rejected";
    } else {
      // Determine next step based on work type requirements AND location
      const workType = currentPermit?.work_types as WorkType | null;
      const { nextStatus, nextRole } = getNextApprovalStep(roleField, workType, locationType);
      updateData.status = nextStatus;
      console.log(`Moving permit from ${roleField} to ${nextStatus} (next role: ${nextRole}, location: ${locationType})`);
      console.log(`Moving permit from ${roleField} to ${nextStatus} (next role: ${nextRole})`);
    }

    const { data: updatedPermit, error: updateError } = await serviceClient
      .from("work_permits")
      .update(updateData)
      .eq("id", permitId)
      .select()
      .single();

    if (updateError) {
      console.error("Permit update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update permit" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Log activity
    await serviceClient.from("activity_logs").insert({
      permit_id: permitId,
      action: approved ? `${role} Approved` : `${role} Rejected`,
      performed_by: userName,
      performed_by_id: user.id,
      details: comments || `${approved ? "Approved" : "Rejected"} with verified signature`,
    });

    // Create notification for requester
    if (updatedPermit.requester_id) {
      await serviceClient.from("notifications").insert({
        user_id: updatedPermit.requester_id,
        permit_id: permitId,
        type: approved ? "permit_approved" : "permit_rejected",
        title: `Permit ${approved ? "Approved" : "Rejected"} by ${role.toUpperCase()}`,
        message: `Your permit ${updatedPermit.permit_no} has been ${approved ? "approved" : "rejected"} by ${userName}. ${comments ? `Comments: ${comments}` : ""}`,
      });

      // Send push notification to requester
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: updatedPermit.requester_id,
            title: `Permit ${approved ? "Approved" : "Rejected"}`,
            message: `${updatedPermit.permit_no} has been ${approved ? "approved" : "rejected"} by ${role.toUpperCase()}`,
            data: { url: `/permits/${permitId}`, permitId },
          }),
        });
        console.log("Push notification sent to requester");
      } catch (pushError) {
        console.error("Failed to send push notification to requester:", pushError);
      }
    }

    // Send email notification to requester
    if (updatedPermit.requester_email) {
      try {
        // Determine notification type based on approval status and final status
        let emailNotificationType: string;
        let emailSubject: string;
        let statusMessage: string = '';
        
        if (!approved) {
          emailNotificationType = 'rejected';
          emailSubject = `Work Permit Rejected: ${updatedPermit.permit_no}`;
        } else if (updatedPermit.status === 'approved') {
          emailNotificationType = 'approved';
          emailSubject = `Work Permit Approved: ${updatedPermit.permit_no}`;
        } else {
          // Permit approved by this role but moving to next stage
          emailNotificationType = 'status_update';
          const roleLabel = role.toUpperCase().replace('_', ' ');
          statusMessage = `It has been approved by ${roleLabel} and is now pending the next approval.`;
          emailSubject = `Work Permit Progress Update: ${updatedPermit.permit_no}`;
        }

        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: [updatedPermit.requester_email],
            notificationType: emailNotificationType,
            subject: emailSubject,
            permitNo: updatedPermit.permit_no,
            permitId: permitId,
            details: {
              permitId: permitId,
              workType: currentPermit?.work_types?.name,
              approverName: userName,
              reason: comments,
              statusMessage: statusMessage,
            },
          }),
        });
        console.log(`Email notification (${emailNotificationType}) sent to requester:`, emailResponse.ok);
      } catch (emailError) {
        console.error("Failed to send email notification to requester:", emailError);
      }
    }

    // If approved and not final approval, notify the next approvers
    if (approved && updatedPermit.status !== 'approved') {
      const workType = currentPermit?.work_types as WorkType | null;
      const { nextRole } = getNextApprovalStep(roleField, workType, locationType);
      
      if (nextRole) {
        // Get users with the next role
        const { data: nextApprovers } = await serviceClient
          .from("user_roles")
          .select("user_id")
          .eq("role", nextRole);

        if (nextApprovers && nextApprovers.length > 0) {
          const roleLabel = nextRole.toUpperCase().replace('_', ' ');
          const approverIds: string[] = [];
          
          for (const approver of nextApprovers) {
            await serviceClient.from("notifications").insert({
              user_id: approver.user_id,
              permit_id: permitId,
              type: "pending_approval",
              title: `Permit Pending Your Approval`,
              message: `Permit ${updatedPermit.permit_no} requires your review as ${roleLabel}.`,
            });
            approverIds.push(approver.user_id);
          }
          
          // Send push notifications to next approvers
          if (approverIds.length > 0) {
            try {
              await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  userIds: approverIds,
                  title: `Permit Awaiting Your Approval`,
                  message: `${updatedPermit.permit_no} requires your review as ${roleLabel}`,
                  data: { url: `/inbox`, permitId },
                }),
              });
              console.log(`Push notification sent to ${approverIds.length} next approvers`);
            } catch (pushError) {
              console.error("Failed to send push notification to next approvers:", pushError);
            }
          }
          
          // Get emails for next approvers and send email notifications
          if (approverIds.length > 0) {
            const { data: approverProfiles } = await serviceClient
              .from("profiles")
              .select("email")
              .in("id", approverIds);
            
            const approverEmails = approverProfiles?.map(p => p.email).filter(Boolean) || [];
            
            if (approverEmails.length > 0) {
              try {
                const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    to: approverEmails,
                    notificationType: 'approval_required',
                    subject: `Work Permit Awaiting Approval: ${updatedPermit.permit_no}`,
                    permitNo: updatedPermit.permit_no,
                    permitId: permitId,
                    details: {
                      permitId: permitId,
                      workType: currentPermit?.work_types?.name,
                      requesterName: updatedPermit.requester_name,
                      urgency: updatedPermit.urgency,
                    },
                  }),
                });
                console.log("Email notification sent to next approvers:", emailResponse.ok);
              } catch (emailError) {
                console.error("Failed to send email notification to next approvers:", emailError);
              }
            }
          }
          
          console.log(`Notified ${nextApprovers.length} ${nextRole} approvers`);
        }
      }
    }

    console.log("Permit updated successfully:", permitId, "new status:", updatedPermit.status);

    return new Response(
      JSON.stringify({ 
        success: true, 
        permit: updatedPermit,
        auditInfo: {
          ipAddress,
          deviceInfo,
          timestamp: new Date().toISOString(),
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error processing approval:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
