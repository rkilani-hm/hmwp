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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Checking for SLA breaches at:", new Date().toISOString());

    // Find permits that have exceeded their SLA deadline and haven't been marked as breached
    const { data: breachedPermits, error: fetchError } = await supabase
      .from("work_permits")
      .select("id, permit_no, requester_id, sla_deadline, urgency, status")
      .lt("sla_deadline", new Date().toISOString())
      .eq("sla_breached", false)
      .in("status", ["submitted", "pending_pm", "pending_pd", "pending_bdcr", "pending_mpr", "pending_it", "pending_fitout", "pending_soft_facilities", "pending_hard_facilities", "pending_pm_service", "under_review"]);

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
          message: `Your ${permit.urgency === "urgent" ? "urgent " : ""}permit ${permit.permit_no} has exceeded its SLA deadline. The expected completion time has passed.`,
        });
      }

      // Notify all admins
      for (const adminId of adminIds) {
        await supabase.from("notifications").insert({
          user_id: adminId,
          permit_id: permit.id,
          type: "sla_breach",
          title: "SLA Breach Alert",
          message: `Permit ${permit.permit_no} (${permit.urgency === "urgent" ? "URGENT" : "Normal"}) has breached its SLA deadline. Current status: ${permit.status}`,
        });
      }

      // Log activity
      await supabase.from("activity_logs").insert({
        permit_id: permit.id,
        action: "SLA Breached",
        performed_by: "System",
        details: `Permit exceeded ${permit.urgency === "urgent" ? "4-hour" : "48-hour"} SLA deadline`,
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
      .in("status", ["submitted", "pending_pm", "pending_pd", "pending_bdcr", "pending_mpr", "pending_it", "pending_fitout", "pending_soft_facilities", "pending_hard_facilities", "pending_pm_service", "under_review"]);

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
