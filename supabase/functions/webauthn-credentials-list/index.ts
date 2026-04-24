// =============================================================================
// webauthn-credentials-list
//
// Returns the current user's registered WebAuthn credentials (for the Settings
// page "Registered Devices" section). Does not return the public key itself —
// only metadata.
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  corsHeaders,
  getAuthenticatedUser,
  getServiceClient,
  jsonResponse,
  errorResponse,
} from "../_shared/webauthn.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const { user, error: authError } = await getAuthenticatedUser(req);
  if (!user) return errorResponse(authError || "Unauthorized", 401);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("webauthn_credentials")
    .select("id, device_name, transports, created_at, last_used_at, backup_state")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return jsonResponse({ credentials: data ?? [] });
});
