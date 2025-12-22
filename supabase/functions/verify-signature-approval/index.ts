import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApprovalRequest {
  permitId: string;
  role: string;
  comments: string;
  signature: string | null;
  approved: boolean;
  password: string;
}

interface WorkType {
  id: string;
  name: string;
  requires_pm: boolean;
  requires_pd: boolean;
  requires_bdcr: boolean;
  requires_mpr: boolean;
  requires_it: boolean;
  requires_fitout: boolean;
  requires_soft_facilities: boolean;
  requires_hard_facilities: boolean;
}

// Define the approval workflow order
const APPROVAL_ORDER = [
  { role: 'helpdesk', status: 'submitted', nextStatus: 'pending_pm', requiresField: null },
  { role: 'pm', status: 'pending_pm', nextStatus: 'pending_pd', requiresField: 'requires_pm' },
  { role: 'pd', status: 'pending_pd', nextStatus: 'pending_bdcr', requiresField: 'requires_pd' },
  { role: 'bdcr', status: 'pending_bdcr', nextStatus: 'pending_mpr', requiresField: 'requires_bdcr' },
  { role: 'mpr', status: 'pending_mpr', nextStatus: 'pending_it', requiresField: 'requires_mpr' },
  { role: 'it', status: 'pending_it', nextStatus: 'pending_fitout', requiresField: 'requires_it' },
  { role: 'fitout', status: 'pending_fitout', nextStatus: 'pending_soft_facilities', requiresField: 'requires_fitout' },
  { role: 'soft_facilities', status: 'pending_soft_facilities', nextStatus: 'pending_hard_facilities', requiresField: 'requires_soft_facilities' },
  { role: 'hard_facilities', status: 'pending_hard_facilities', nextStatus: 'pending_pm_service', requiresField: 'requires_hard_facilities' },
  { role: 'pm_service', status: 'pending_pm_service', nextStatus: 'approved', requiresField: null },
];

// Get the next required approval step based on work type
function getNextApprovalStep(currentRole: string, workType: WorkType | null): { nextStatus: string; nextRole: string | null } {
  const currentIndex = APPROVAL_ORDER.findIndex(step => step.role === currentRole);
  if (currentIndex === -1) {
    return { nextStatus: 'approved', nextRole: null };
  }

  // Look for the next required step
  for (let i = currentIndex + 1; i < APPROVAL_ORDER.length; i++) {
    const step = APPROVAL_ORDER[i];
    
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

    const {
      permitId,
      role,
      comments,
      signature,
      approved,
      password,
    }: ApprovalRequest = await req.json();

    console.log("Processing approval for permit:", permitId, "role:", role, "approved:", approved);

    // Verify password by attempting to sign in
    const { error: signInError } = await userClient.auth.signInWithPassword({
      email: user.email!,
      password: password,
    });

    if (signInError) {
      console.error("Password verification failed:", signInError);
      return new Response(JSON.stringify({ error: "Invalid password. Please enter your correct password to confirm approval." }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Password verified successfully for user:", user.email);

    // Extract device info from request
    const ipAddress = req.headers.get("x-forwarded-for") || 
                      req.headers.get("x-real-ip") || 
                      req.headers.get("cf-connecting-ip") ||
                      "unknown";
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

    // Get the current permit with work type to determine next step
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
          requires_soft_facilities,
          requires_hard_facilities
        )
      `)
      .eq("id", permitId)
      .single();

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
      // Determine next step based on work type requirements
      const workType = currentPermit?.work_types as WorkType | null;
      const { nextStatus, nextRole } = getNextApprovalStep(roleField, workType);
      updateData.status = nextStatus;
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
    }

    // If approved and not final approval, notify the next approvers
    if (approved && updatedPermit.status !== 'approved') {
      const workType = currentPermit?.work_types as WorkType | null;
      const { nextRole } = getNextApprovalStep(roleField, workType);
      
      if (nextRole) {
        // Get users with the next role
        const { data: nextApprovers } = await serviceClient
          .from("user_roles")
          .select("user_id")
          .eq("role", nextRole);

        if (nextApprovers && nextApprovers.length > 0) {
          const roleLabel = nextRole.toUpperCase().replace('_', ' ');
          for (const approver of nextApprovers) {
            await serviceClient.from("notifications").insert({
              user_id: approver.user_id,
              permit_id: permitId,
              type: "pending_approval",
              title: `Permit Pending Your Approval`,
              message: `Permit ${updatedPermit.permit_no} requires your review as ${roleLabel}.`,
            });
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