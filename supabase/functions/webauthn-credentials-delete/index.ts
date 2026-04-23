// =============================================================================
// webauthn-credentials-delete
//
// Removes a registered WebAuthn credential belonging to the current user.
// Body: { credentialRowId: uuid }
// =============================================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  corsHeaders,
  getAuthenticatedUser,
  getServiceClient,
  jsonResponse,
  errorResponse,
} from "../_shared/webauthn.ts";

const BodySchema = z.object({
  credentialRowId: z.string().uuid(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const { user, error: authError } = await getAuthenticatedUser(req);
  if (!user) return errorResponse(authError || "Unauthorized", 401);

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return errorResponse("Invalid request body", 400);

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("webauthn_credentials")
    .delete()
    .eq("id", parsed.data.credentialRowId)
    .eq("user_id", user.id);  // user can only delete their own

  if (error) return errorResponse(error.message, 500);
  return jsonResponse({ success: true });
});
