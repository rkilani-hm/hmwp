import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limit per admin: deletion is high-impact, keep this conservative.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_DELETES_PER_WINDOW = 10;
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(adminId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(adminId);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(adminId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (record.count >= MAX_DELETES_PER_WINDOW) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count++;
  return { allowed: true };
}

const DeleteUserSchema = z.object({
  userId: z.string().uuid("Invalid user ID format"),
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate input
    const parsed = DeleteUserSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.issues[0]?.message || "Invalid input" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const { userId } = parsed.data;

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is authenticated and is an admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: callerErr } = await userClient.auth.getUser();
    if (callerErr || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Rate-limit per admin
    const rl = checkRateLimit(callerUser.id);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rl.retryAfter),
            ...corsHeaders,
          },
        }
      );
    }

    // Service-role client for the admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin role via has_role()
    const { data: isAdmin, error: roleErr } = await adminClient.rpc("has_role", {
      _user_id: callerUser.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin role required" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Don't let admins delete themselves
    if (callerUser.id === userId) {
      return new Response(
        JSON.stringify({ error: "You cannot delete your own account" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Pre-fetch the target's profile for the audit log entry below
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .maybeSingle();

    // Delete the auth user. ON DELETE CASCADE on profiles.id and
    // user_roles.user_id removes the matching rows automatically.
    // activity_logs.performed_by_id has ON DELETE SET NULL so historical
    // log entries remain (with the actor cleared).
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteErr) {
      console.error("Error deleting auth user:", deleteErr);

      // Surface FK constraint violations as actionable messages rather
      // than generic 500s. Postgres reports these in deleteErr.message
      // with the constraint name; we map known ones to plain English.
      const raw = (deleteErr.message || "").toLowerCase();
      let friendly = deleteErr.message || "Failed to delete user";

      if (raw.includes("foreign key") || raw.includes("violates")) {
        if (raw.includes("permit_workflow_audit")) {
          friendly =
            "This user has modified workflows on existing permits. The system needs to be updated " +
            "to allow deletion — please apply the user-delete-cascades migration and try again.";
        } else if (raw.includes("permit_workflow_overrides")) {
          friendly =
            "This user has created workflow overrides on existing permits. Apply the " +
            "user-delete-cascades migration and try again.";
        } else if (raw.includes("workflow_modified_by")) {
          friendly =
            "This user has customized workflows on existing permits. Apply the " +
            "user-delete-cascades migration and try again.";
        } else {
          // Generic FK message that still tells the admin what to do
          friendly =
            "Cannot delete this user because other records reference them. " +
            "Database error: " + deleteErr.message;
        }
      }

      // Return 200 so the frontend's `data.error` is populated (avoids
      // the supabase-js non-2xx swallowing where data is null).
      return new Response(
        JSON.stringify({ success: false, error: friendly }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Best-effort audit log entry — don't fail the operation if this errors.
    try {
      await adminClient.from("activity_logs").insert({
        action: "User Account Deleted",
        performed_by: callerUser.email || "Admin",
        performed_by_id: callerUser.id,
        details: targetProfile
          ? `Deleted account for ${targetProfile.full_name || targetProfile.email}`
          : `Deleted user ${userId}`,
      });
    } catch (auditErr) {
      console.error("Audit log insert failed (non-fatal):", auditErr);
    }

    return new Response(
      JSON.stringify({ success: true, message: "User deleted" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: any) {
    console.error("admin-delete-user fatal:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
