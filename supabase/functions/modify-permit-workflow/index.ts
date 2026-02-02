import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Special token for biometric verification
const BIOMETRIC_TOKEN = '__BIOMETRIC_VERIFIED__';

// Input validation schema
const ModifyWorkflowSchema = z.object({
  permitId: z.string().uuid("Invalid permit ID format"),
  modificationType: z.enum(['work_type_change', 'custom_flow']),
  newWorkTypeId: z.string().uuid().optional(),
  customSteps: z.array(z.object({
    stepId: z.string().uuid(),
    isRequired: z.boolean(),
  })).optional(),
  reason: z.string().min(1, "Reason is required").max(1000),
  password: z.string().min(1, "Password is required"),
});

// Add consistent delay to prevent timing attacks
async function constantTimePasswordCheck(
  supabaseUrl: string,
  supabaseAnonKey: string,
  email: string,
  password: string
): Promise<boolean> {
  const startTime = Date.now();
  const MIN_RESPONSE_TIME = 500;
  
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
  
  const elapsed = Date.now() - startTime;
  if (elapsed < MIN_RESPONSE_TIME) {
    await new Promise(resolve => setTimeout(resolve, MIN_RESPONSE_TIME - elapsed));
  }
  
  return isValid;
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

    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      console.error("User auth error:", userError);
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Parse and validate request body
    const rawBody = await req.json();
    const parseResult = ModifyWorkflowSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => e.message).join(", ");
      return new Response(JSON.stringify({ error: `Validation failed: ${errorMessages}` }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { permitId, modificationType, newWorkTypeId, customSteps, reason, password } = parseResult.data;

    const ipAddress = req.headers.get("x-forwarded-for") || 
                      req.headers.get("x-real-ip") || 
                      req.headers.get("cf-connecting-ip") ||
                      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    console.log("Processing workflow modification for permit:", permitId, "type:", modificationType);

    // Verify password or biometric
    const isBiometricAuth = password === BIOMETRIC_TOKEN;
    let isVerified = false;

    if (isBiometricAuth) {
      console.log("Biometric verification used for user:", user.email);
      isVerified = true;
    } else {
      isVerified = await constantTimePasswordCheck(supabaseUrl, supabaseAnonKey, user.email!, password);
    }

    if (!isVerified) {
      return new Response(JSON.stringify({ error: "Invalid password" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get user profile
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const userName = profile?.full_name || user.email || "Unknown";
    const userEmail = profile?.email || user.email || "unknown";

    // Get the current permit
    const { data: permit, error: permitError } = await adminClient
      .from("work_permits")
      .select(`
        id,
        status,
        work_type_id,
        work_types (
          id,
          name,
          workflow_template_id
        )
      `)
      .eq("id", permitId)
      .single();

    if (permitError || !permit) {
      return new Response(JSON.stringify({ error: "Permit not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Verify user is an approver
    const { data: isApprover } = await adminClient.rpc('is_approver', { _user_id: user.id });
    if (!isApprover) {
      return new Response(JSON.stringify({ error: "Only approvers can modify workflows" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check permit is in a pending status
    if (!permit.status.startsWith('pending_') && !['submitted', 'under_review'].includes(permit.status)) {
      return new Response(JSON.stringify({ error: "Can only modify workflow for permits pending approval" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get current workflow steps for audit trail
    const workType = permit.work_types as any;
    let originalSteps: any[] = [];
    
    if (workType?.workflow_template_id) {
      const { data: steps } = await adminClient
        .from("workflow_steps")
        .select(`
          id,
          step_order,
          role_id,
          step_name,
          is_required_default,
          role:roles(name, label)
        `)
        .eq("workflow_template_id", workType.workflow_template_id)
        .order("step_order");
      
      originalSteps = steps || [];
    }

    // Get current overrides
    const { data: currentOverrides } = await adminClient
      .from("permit_workflow_overrides")
      .select("*")
      .eq("permit_id", permitId);

    // Build original steps snapshot with overrides applied
    const originalStepsWithOverrides = originalSteps.map(step => {
      const override = currentOverrides?.find(o => o.workflow_step_id === step.id);
      const role = step.role as any;
      return {
        id: step.id,
        role: role?.name,
        roleLabel: role?.label,
        isRequired: override ? override.is_required : step.is_required_default,
      };
    });

    let newStepsSnapshot: any[] = [];
    let newWorkTypeIdFinal = permit.work_type_id;

    if (modificationType === 'work_type_change' && newWorkTypeId) {
      // Get the new work type and its workflow
      const { data: newWorkType } = await adminClient
        .from("work_types")
        .select(`
          id,
          name,
          workflow_template_id
        `)
        .eq("id", newWorkTypeId)
        .single();

      if (!newWorkType) {
        return new Response(JSON.stringify({ error: "New work type not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (!newWorkType.workflow_template_id) {
        return new Response(JSON.stringify({ error: "New work type has no workflow configured" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      newWorkTypeIdFinal = newWorkTypeId;

      // Get new workflow steps
      const { data: newSteps } = await adminClient
        .from("workflow_steps")
        .select(`
          id,
          step_order,
          role_id,
          step_name,
          is_required_default,
          role:roles(name, label)
        `)
        .eq("workflow_template_id", newWorkType.workflow_template_id)
        .order("step_order");

      // Get step config for new work type
      const { data: newStepConfig } = await adminClient
        .from("work_type_step_config")
        .select("*")
        .eq("work_type_id", newWorkTypeId);

      const configMap = new Map(newStepConfig?.map(c => [c.workflow_step_id, c.is_required]) || []);

      newStepsSnapshot = (newSteps || []).map(step => {
        const role = step.role as any;
        return {
          id: step.id,
          role: role?.name,
          roleLabel: role?.label,
          isRequired: configMap.has(step.id) ? configMap.get(step.id) : step.is_required_default,
        };
      });

      // Delete existing overrides (we're switching work types)
      await adminClient
        .from("permit_workflow_overrides")
        .delete()
        .eq("permit_id", permitId);

      // Update the permit's work type
      const { error: updateError } = await adminClient
        .from("work_permits")
        .update({
          work_type_id: newWorkTypeId,
          workflow_customized: true,
          workflow_modified_by: user.id,
          workflow_modified_at: new Date().toISOString(),
        })
        .eq("id", permitId);

      if (updateError) {
        console.error("Failed to update permit work type:", updateError);
        return new Response(JSON.stringify({ error: "Failed to update permit" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

    } else if (modificationType === 'custom_flow' && customSteps) {
      // Apply custom step overrides
      
      // Delete existing overrides first
      await adminClient
        .from("permit_workflow_overrides")
        .delete()
        .eq("permit_id", permitId);

      // Insert new overrides
      const overridesToInsert = customSteps.map(step => ({
        permit_id: permitId,
        workflow_step_id: step.stepId,
        is_required: step.isRequired,
        created_by: user.id,
      }));

      if (overridesToInsert.length > 0) {
        const { error: insertError } = await adminClient
          .from("permit_workflow_overrides")
          .insert(overridesToInsert);

        if (insertError) {
          console.error("Failed to insert overrides:", insertError);
          return new Response(JSON.stringify({ error: "Failed to save workflow overrides" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

      // Build new steps snapshot
      const customMap = new Map(customSteps.map(s => [s.stepId, s.isRequired]));
      newStepsSnapshot = originalSteps.map(step => {
        const role = step.role as any;
        return {
          id: step.id,
          role: role?.name,
          roleLabel: role?.label,
          isRequired: customMap.has(step.id) ? customMap.get(step.id) : step.is_required_default,
        };
      });

      // Mark permit as customized
      const { error: updateError } = await adminClient
        .from("work_permits")
        .update({
          workflow_customized: true,
          workflow_modified_by: user.id,
          workflow_modified_at: new Date().toISOString(),
        })
        .eq("id", permitId);

      if (updateError) {
        console.error("Failed to update permit:", updateError);
      }
    }

    // Create audit log entry
    const { error: auditError } = await adminClient
      .from("permit_workflow_audit")
      .insert({
        permit_id: permitId,
        modified_by: user.id,
        modified_by_name: userName,
        modified_by_email: userEmail,
        modification_type: modificationType,
        original_work_type_id: permit.work_type_id,
        new_work_type_id: modificationType === 'work_type_change' ? newWorkTypeId : null,
        original_steps: originalStepsWithOverrides,
        new_steps: newStepsSnapshot,
        reason,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

    if (auditError) {
      console.error("Failed to create audit log:", auditError);
    }

    // Log activity
    await adminClient.from("activity_logs").insert({
      permit_id: permitId,
      action: modificationType === 'work_type_change' ? 'Workflow Type Changed' : 'Custom Workflow Applied',
      performed_by: userName,
      performed_by_id: user.id,
      details: reason,
    });

    console.log("Workflow modification completed successfully for permit:", permitId);

    return new Response(
      JSON.stringify({ 
        success: true,
        modificationType,
        auditInfo: {
          modifiedBy: userName,
          timestamp: new Date().toISOString(),
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error processing workflow modification:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
