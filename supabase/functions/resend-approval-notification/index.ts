import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get user's auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(token);
    if (userError || !user) {
      console.error("User auth error:", userError);
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if user is admin
    const { data: userRoles, error: rolesError } = await serviceClient
      .from("user_roles")
      .select("role_id, roles:role_id(name)")
      .eq("user_id", user.id);

    if (rolesError) {
      console.error("Error fetching user roles:", rolesError);
      return new Response(JSON.stringify({ error: "Failed to verify permissions" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const isAdmin = userRoles?.some((ur: any) => ur.roles?.name === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin permission required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Parse request body
    const { permitId } = await req.json();
    if (!permitId) {
      return new Response(JSON.stringify({ error: "Permit ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get permit details
    const { data: permit, error: permitError } = await serviceClient
      .from("work_permits")
      .select("id, permit_no, status, urgency, requester_name")
      .eq("id", permitId)
      .single();

    if (permitError || !permit) {
      console.error("Permit fetch error:", permitError);
      return new Response(JSON.stringify({ error: "Permit not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if permit is in a pending status
    if (!permit.status.startsWith("pending_") && !["submitted", "under_review"].includes(permit.status)) {
      return new Response(JSON.stringify({ error: "Permit is not in a pending status" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Determine the pending role
    let pendingRole = permit.status.replace("pending_", "");
    if (["submitted", "under_review"].includes(permit.status)) {
      pendingRole = "helpdesk";
    }

    console.log(`Resending notifications for permit ${permit.permit_no} to role: ${pendingRole}`);

    // Get role ID
    const { data: role, error: roleError } = await serviceClient
      .from("roles")
      .select("id, label")
      .eq("name", pendingRole)
      .single();

    if (roleError || !role) {
      console.error("Role fetch error:", roleError);
      return new Response(JSON.stringify({ error: `Role '${pendingRole}' not found` }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get users with this role
    const { data: roleUsers, error: roleUsersError } = await serviceClient
      .from("user_roles")
      .select("user_id")
      .eq("role_id", role.id);

    if (roleUsersError) {
      console.error("Role users fetch error:", roleUsersError);
      return new Response(JSON.stringify({ error: "Failed to fetch approvers" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!roleUsers || roleUsers.length === 0) {
      return new Response(JSON.stringify({ error: `No users assigned to role '${pendingRole}'` }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const approverIds = roleUsers.map((ru: any) => ru.user_id);
    const roleLabel = role.label || pendingRole.toUpperCase().replace(/_/g, " ");

    // Create in-app notifications
    let inAppNotificationsSent = 0;
    for (const approverId of approverIds) {
      const { error: notifError } = await serviceClient.from("notifications").insert({
        user_id: approverId,
        permit_id: permitId,
        type: "approval_needed",
        title: "[Reminder] Permit Pending Your Approval",
        message: `Permit ${permit.permit_no} requires your review as ${roleLabel}.`,
      });

      if (!notifError) {
        inAppNotificationsSent++;
      } else {
        console.error(`Failed to create notification for user ${approverId}:`, notifError);
      }
    }

    console.log(`Created ${inAppNotificationsSent} in-app notifications`);

    // Send push notifications
    let pushNotificationsSent = 0;
    try {
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userIds: approverIds,
          title: "[Reminder] Permit Awaiting Approval",
          message: `${permit.permit_no} requires your review as ${roleLabel}`,
          data: { url: "/inbox", permitId },
        }),
      });

      if (pushResponse.ok) {
        pushNotificationsSent = approverIds.length;
        console.log("Push notifications sent successfully");
      } else {
        console.error("Push notification failed:", await pushResponse.text());
      }
    } catch (pushError) {
      console.error("Failed to send push notifications:", pushError);
    }

    // Send email notifications
    let emailNotificationsSent = 0;
    try {
      // Get approver emails
      const { data: approverProfiles } = await serviceClient
        .from("profiles")
        .select("email")
        .in("id", approverIds);

      const approverEmails = approverProfiles?.map((p: any) => p.email).filter(Boolean) || [];

      if (approverEmails.length > 0) {
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: approverEmails,
            notificationType: "approval_required",
            subject: `[Reminder] Work Permit Pending Approval: ${permit.permit_no}`,
            permitNo: permit.permit_no,
            permitId: permitId,
            details: {
              permitId: permitId,
              requesterName: permit.requester_name,
              urgency: permit.urgency,
              roleLabel: roleLabel,
              isReminder: true,
            },
          }),
        });

        if (emailResponse.ok) {
          emailNotificationsSent = approverEmails.length;
          console.log("Email notifications sent successfully");
        } else {
          console.error("Email notification failed:", await emailResponse.text());
        }
      }
    } catch (emailError) {
      console.error("Failed to send email notifications:", emailError);
    }

    // Log the resend action
    const { data: adminProfile } = await serviceClient
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    await serviceClient.from("activity_logs").insert({
      permit_id: permitId,
      action: "Notifications Resent",
      performed_by: adminProfile?.full_name || user.email || "Admin",
      performed_by_id: user.id,
      details: `Admin resent approval notifications to ${roleLabel} (${approverIds.length} user(s))`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Notifications resent to ${approverIds.length} approver(s)`,
        details: {
          inAppNotifications: inAppNotificationsSent,
          pushNotifications: pushNotificationsSent,
          emailNotifications: emailNotificationsSent,
          targetRole: roleLabel,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    console.error("Error in resend-approval-notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
