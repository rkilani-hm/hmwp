import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting configuration for admin operations
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_OPERATIONS_PER_WINDOW = 10;
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkAdminRateLimit(adminId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(adminId);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(adminId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  
  if (record.count >= MAX_OPERATIONS_PER_WINDOW) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  record.count++;
  return { allowed: true };
}

// Input validation schema - roles validated dynamically from database
const CreateUserSchema = z.object({
  email: z.string()
    .email("Invalid email format")
    .max(255, "Email must be less than 255 characters")
    .transform(val => val.toLowerCase().trim()),
  password: z.string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password must be less than 100 characters"),
  fullName: z.string()
    .min(1, "Full name is required")
    .max(100, "Full name must be less than 100 characters")
    .transform(val => val.trim()),
  companyName: z.string()
    .max(100, "Company name must be less than 100 characters")
    .transform(val => val.trim())
    .optional(),
  roles: z.array(z.string())
    .min(1, "At least one role is required")
    .max(10, "Maximum 10 roles allowed"),
});

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify identity
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin role using service role client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    
    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role_id, roles!inner(name)")
      .eq("user_id", user.id)
      .eq("roles.name", "admin")
      .single();

    if (roleError || !adminRole) {
      return new Response(
        JSON.stringify({ error: "Forbidden - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check rate limit for admin
    const rateLimitResult = checkAdminRateLimit(user.id);
    if (!rateLimitResult.allowed) {
      console.warn("Rate limit exceeded for admin:", user.id);
      return new Response(
        JSON.stringify({ error: "Too many requests. Please wait before creating more users." }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": String(rateLimitResult.retryAfter)
          } 
        }
      );
    }

    // Parse and validate request body
    const rawBody = await req.json();
    const parseResult = CreateUserSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => e.message).join(", ");
      console.error("Validation failed:", parseResult.error.errors);
      return new Response(
        JSON.stringify({ error: `Validation failed: ${errorMessages}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, fullName, companyName, roles } = parseResult.data;
    
    // Validate that all roles exist in the database
    const { data: validRolesData, error: rolesQueryError } = await supabaseAdmin
      .from("roles")
      .select("name")
      .in("name", roles);
    
    if (rolesQueryError) {
      console.error("Error fetching roles:", rolesQueryError);
      return new Response(
        JSON.stringify({ error: "Failed to validate roles" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const validRoleNames = new Set(validRolesData?.map(r => r.name) || []);
    const invalidRoles = roles.filter(r => !validRoleNames.has(r));
    
    if (invalidRoles.length > 0) {
      console.error("Invalid roles provided:", invalidRoles);
      return new Response(
        JSON.stringify({ error: `Invalid roles: ${invalidRoles.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log("Creating user:", email, "with roles:", roles);

    // Create the user using admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName,
      },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure profile is updated with correct email and full_name
    // The trigger may run before the user metadata is fully populated
    if (newUser.user) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ 
          email: email,
          full_name: fullName,
          company_name: companyName || undefined
        })
        .eq("id", newUser.user.id);

      if (profileError) {
        console.error("Error updating profile:", profileError);
      }
    }

    // The handle_new_user trigger should have created the profile and default contractor role
    // Now add any additional roles
    if (roles && roles.length > 0 && newUser.user) {
      // Get role IDs from the roles table
      const { data: rolesData } = await supabaseAdmin
        .from("roles")
        .select("id, name")
        .in("name", [...roles, "contractor"]);

      const roleMap = new Map(rolesData?.map(r => [r.name, r.id]) || []);
      const contractorRoleId = roleMap.get("contractor");

      // First remove the default contractor role if other roles are specified
      // and contractor is not in the list
      if (!roles.includes("contractor") && contractorRoleId) {
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", newUser.user.id)
          .eq("role_id", contractorRoleId);
      }

      // Add the specified roles (excluding contractor if it's already added by trigger)
      const rolesToAdd = roles.filter(role => role !== "contractor");
      
      for (const role of rolesToAdd) {
        const roleId = roleMap.get(role);
        if (roleId) {
          await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: newUser.user.id, role_id: roleId });
        }
      }
    }

    console.log("User created successfully:", newUser.user?.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { 
          id: newUser.user?.id, 
          email: newUser.user?.email 
        } 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
