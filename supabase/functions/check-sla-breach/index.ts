import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: require service-role bearer (cron/internal) or an authenticated admin user
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth — any ONE of:
    //   (a) x-reminder-secret header matching REMINDER_CRON_SECRET (the pg_cron
    //       caller; the service-role key isn't reachable from SQL, so the cron
    //       sends this shared secret instead of a bearer),
    //   (b) the service-role key as the bearer, or
    //   (c) an authenticated admin user (manual run).
    const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
    const providedSecret = req.headers.get("x-reminder-secret");
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    let authorized = false;
    if (cronSecret && providedSecret && providedSecret === cronSecret) {
      authorized = true;
    } else if (token && token === supabaseServiceKey) {
      authorized = true;
    } else if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (isAdmin) authorized = true;
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Checking for SLA breaches at:", new Date().toISOString());

    // Find permits that have exceeded their SLA deadline and haven't been marked as breached
    const { data: breachedPermits, error: fetchError } = await supabase
      .from("work_permits")
      .select("id, permit_no, requester_id, sla_deadline, urgency, status")
      .lt("sla_deadline", new Date().toISOString())
      .eq("sla_breached", false)
      // Any non-terminal permit (robust to dynamic pending_<role> statuses).
      .not("status", "in", "(approved,rejected,cancelled,closed,draft,superseded)");

    if (fetchError) {
      console.error("Error fetching permits:", fetchError);
      throw fetchError;
    }

    console.log("Found", breachedPermits?.length || 0, "permits with SLA breaches");

    if (!breachedPermits || breachedPermits.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No SLA breaches found", count: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get all admin users for notifications
    const { data: adminUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = adminUsers?.map(u => u.user_id) || [];

    // Process each breached permit
    for (const permit of breachedPermits) {
      // Mark as breached
      await supabase
        .from("work_permits")
        .update({ sla_breached: true })
        .eq("id", permit.id);

      console.log("Marked permit", permit.permit_no, "as SLA breached");

      // Notify requester
      if (permit.requester_id) {
        await supabase.from("notifications").insert({
          user_id: permit.requester_id,
          permit_id: permit.id,
          type: "sla_breach",
          title: "SLA Deadline Exceeded",
          message: `Your permit ${permit.permit_no} has exceeded its SLA deadline.`,
        });
      }

      // Notify all admins
      for (const adminId of adminIds) {
        await supabase.from("notifications").insert({
          user_id: adminId,
          permit_id: permit.id,
          type: "sla_breach",
          title: "SLA Breach Alert",
          message: `Permit ${permit.permit_no} has breached its SLA deadline. Current status: ${permit.status}`,
        });
      }

      // Log activity
      await supabase.from("activity_logs").insert({
        permit_id: permit.id,
        action: "SLA Breached",
        performed_by: "System",
        details: `Permit exceeded its SLA deadline`,
      });
    }

    // Check for SLA warnings (approaching deadline within 1 hour)
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { data: warningPermits } = await supabase
      .from("work_permits")
      .select("id, permit_no, requester_id, sla_deadline, urgency")
      .gt("sla_deadline", new Date().toISOString())
      .lt("sla_deadline", oneHourFromNow)
      .eq("sla_breached", false)
      .not("status", "in", "(approved,rejected,cancelled,closed,draft,superseded)");

    // Send warnings (but check if we've already sent one recently - we'd need another field for this)
    console.log("Found", warningPermits?.length || 0, "permits approaching SLA deadline");

    return new Response(
      JSON.stringify({ 
        success: true, 
        breachedCount: breachedPermits.length,
        warningCount: warningPermits?.length || 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error checking SLA breaches:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
