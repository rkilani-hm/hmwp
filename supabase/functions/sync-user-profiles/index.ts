import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin using role_id architecture
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role_id, roles!inner(name)")
      .eq("user_id", user.id)
      .eq("roles.name", "admin")
      .single();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all users from auth.users using admin API
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (authError) {
      console.error("Error fetching auth users:", authError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch users" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sync profiles - create missing ones and update existing ones
    let createdCount = 0;
    let updatedCount = 0;
    
    for (const authUser of authUsers.users) {
      const fullName = authUser.user_metadata?.full_name || 
                       `${authUser.user_metadata?.first_name || ''} ${authUser.user_metadata?.last_name || ''}`.trim() ||
                       null;
      
      // First try to update existing profile
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", authUser.id)
        .single();
      
      if (existingProfile) {
        // Update existing profile
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({
            email: authUser.email,
            full_name: fullName || undefined,
          })
          .eq("id", authUser.id);

        if (!updateError) {
          updatedCount++;
        }
      } else {
        // Create missing profile
        const { error: insertError } = await supabaseAdmin
          .from("profiles")
          .insert({
            id: authUser.id,
            email: authUser.email || 'unknown@email.com',
            full_name: fullName,
            is_active: true,
          });

        if (!insertError) {
          createdCount++;
          console.log(`Created profile for user: ${authUser.email}`);
        } else {
          console.error(`Error creating profile for ${authUser.email}:`, insertError);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced profiles: ${createdCount} created, ${updatedCount} updated`,
        totalUsers: authUsers.users.length,
        created: createdCount,
        updated: updatedCount
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error syncing profiles:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
