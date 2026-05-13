// extract-id-document
//
// Reads a base64-encoded image of a Kuwaiti civil ID or driving
// license and extracts structured fields using a vision model via
// the Lovable AI Gateway.
//
// Request body:
//   {
//     imageBase64: string,     // data URL or raw base64 (jpeg/png)
//     mimeType?: string,        // 'image/jpeg' | 'image/png' (default: jpeg)
//     documentType?: 'civil_id' | 'driving_license' | 'other'
//                              // hint to the model; not authoritative
//   }
//
// Response body (200 always — error info in body, not status):
//   {
//     success: boolean,
//     extracted?: {
//       name: string | null,
//       id_number: string | null,
//       expiry_date: string | null,   // YYYY-MM-DD
//       issue_date: string | null,    // YYYY-MM-DD
//       nationality: string | null,
//       document_type: 'civil_id' | 'driving_license' | 'other',
//       is_kuwaiti_id_or_license: boolean,
//     },
//     error?: string,
//   }
//
// Configuration:
//   - LOVABLE_API_KEY: required. Set via Supabase project secrets.
//     Get one from https://docs.lovable.dev/features/ai-gateway
//   - Model: google/gemini-2.5-flash-lite (currently free tier; fast)
//
// If LOVABLE_API_KEY is missing, the function returns 200 with
// { success: false, error: 'ai_not_configured' } so the frontend can
// gracefully skip extraction without breaking the upload flow.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";

const EXTRACTION_PROMPT = `You are extracting structured data from an image of a Kuwaiti civil ID or driving license.

Look at the image carefully and identify:
- The full name of the document holder (use the English/Latin name if shown; otherwise transliterate the Arabic name)
- The civil ID number (a 12-digit number, usually labeled with "Civil ID No" or similar)
- The expiry date (look for "Expiry" or "تاريخ الانتهاء"; format as YYYY-MM-DD)
- The issue date if visible (format as YYYY-MM-DD)
- The nationality if visible
- Whether this is specifically a civil_id, driving_license, or some other document

Return ONLY a JSON object — no markdown fences, no commentary — with this exact shape:

{
  "name": string | null,
  "id_number": string | null,
  "expiry_date": string | null,
  "issue_date": string | null,
  "nationality": string | null,
  "document_type": "civil_id" | "driving_license" | "other",
  "is_kuwaiti_id_or_license": boolean
}

If the image is not a Kuwaiti civil ID or driving license, set is_kuwaiti_id_or_license=false, document_type="other", and all other fields to null. If a specific field is illegible or not present, set it to null individually.

Dates MUST be in YYYY-MM-DD format. If the date on the document is in DD/MM/YYYY format, convert it. If only the year is visible, assume December 31 of that year for expiry_date.`;

interface ExtractedFields {
  name: string | null;
  id_number: string | null;
  expiry_date: string | null;
  issue_date: string | null;
  nationality: string | null;
  document_type: "civil_id" | "driving_license" | "other";
  is_kuwaiti_id_or_license: boolean;
}

function stripDataUrlPrefix(input: string): { base64: string; mimeType: string } {
  // Strip 'data:image/jpeg;base64,' prefix if present, capturing mime type
  const match = input.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return { mimeType: "image/jpeg", base64: input };
}

function parseExtractionResponse(content: string): ExtractedFields | null {
  // The model usually returns clean JSON, but sometimes wraps it in
  // markdown fences. Strip them and the leading/trailing whitespace.
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    // Minimal shape validation — accept whatever the model gives us
    // and let the caller decide what to do with null fields.
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      name: typeof parsed.name === "string" ? parsed.name : null,
      id_number: typeof parsed.id_number === "string" ? parsed.id_number : null,
      expiry_date: typeof parsed.expiry_date === "string" ? parsed.expiry_date : null,
      issue_date: typeof parsed.issue_date === "string" ? parsed.issue_date : null,
      nationality: typeof parsed.nationality === "string" ? parsed.nationality : null,
      document_type:
        parsed.document_type === "civil_id" ||
        parsed.document_type === "driving_license" ||
        parsed.document_type === "other"
          ? parsed.document_type
          : "other",
      is_kuwaiti_id_or_license: Boolean(parsed.is_kuwaiti_id_or_license),
    };
  } catch (err) {
    console.error("Failed to parse extraction JSON:", err, "raw:", content);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      console.warn("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({
          success: false,
          error: "ai_not_configured",
          message:
            "AI extraction is not configured. Set the LOVABLE_API_KEY secret in your Supabase project to enable it.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.imageBase64 !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "missing_image" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { base64, mimeType: detectedMime } = stripDataUrlPrefix(body.imageBase64);
    const mimeType = body.mimeType || detectedMime || "image/jpeg";

    // Construct the OpenAI-compatible vision request expected by the
    // Lovable AI Gateway. Image is passed as a data URL inside
    // image_url. Gemini Flash Lite accepts the same format.
    const requestBody = {
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      // Lower temperature → more deterministic field extraction
      temperature: 0,
    };

    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text().catch(() => "");
      console.error(`AI gateway returned ${aiResponse.status}:`, errText);
      // 402 = quota exhausted; 429 = rate limit. Surface these
      // specifically so the UI can show a useful message.
      const code =
        aiResponse.status === 402
          ? "ai_quota_exhausted"
          : aiResponse.status === 429
            ? "ai_rate_limited"
            : "ai_request_failed";
      return new Response(
        JSON.stringify({
          success: false,
          error: code,
          message: `AI service returned HTTP ${aiResponse.status}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiResponse.json();
    const content: string | undefined =
      aiJson?.choices?.[0]?.message?.content;

    if (!content) {
      console.error("AI response had no content:", JSON.stringify(aiJson));
      return new Response(
        JSON.stringify({ success: false, error: "ai_empty_response" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const extracted = parseExtractionResponse(content);
    if (!extracted) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "ai_parse_failed",
          message: "Could not parse the AI response as JSON",
          raw: content.slice(0, 500),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, extracted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "internal_error",
        message: (err as Error).message,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
