import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const ResetPasswordSchema = z.object({
  userId: z.string()
    .uuid("Invalid user ID format"),
  newPassword: z.string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password must be less than 100 characters")
    .optional(),
  sendResetEmail: z.boolean()
    .optional(),
}).refine(
  data => data.newPassword || data.sendResetEmail,
  { message: "Must provide either newPassword or sendResetEmail" }
);

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if user is admin using service role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: adminCheck } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!adminCheck) {
      console.error("User is not admin:", user.id);
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Parse and validate request body
    const rawBody = await req.json();
    const parseResult = ResetPasswordSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => e.message).join(", ");
      console.error("Validation failed:", parseResult.error.errors);
      return new Response(JSON.stringify({ error: `Validation failed: ${errorMessages}` }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { userId, newPassword, sendResetEmail } = parseResult.data;

    console.log("Admin password reset request for user:", userId, "by admin:", user.id);

    // Get target user's email
    const { data: targetProfile } = await serviceClient
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .single();

    if (!targetProfile) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (sendResetEmail) {
      // Send password reset email using admin client
      const { error: resetError } = await serviceClient.auth.admin.generateLink({
        type: "recovery",
        email: targetProfile.email,
      });

      if (resetError) {
        console.error("Reset email error:", resetError);
        return new Response(JSON.stringify({ error: "Failed to send reset email" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      console.log("Password reset email sent to:", targetProfile.email);

      return new Response(
        JSON.stringify({ success: true, message: "Password reset email sent" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    if (newPassword) {
      // Directly update the user's password
      const { error: updateError } = await serviceClient.auth.admin.updateUserById(
        userId,
        { password: newPassword }
      );

      if (updateError) {
        console.error("Password update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to update password" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      console.log("Password updated for user:", userId);

      return new Response(
        JSON.stringify({ success: true, message: "Password updated successfully" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // This shouldn't be reached due to the refine validation, but keeping as fallback
    return new Response(JSON.stringify({ error: "Must provide newPassword or sendResetEmail" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in admin-reset-password:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
