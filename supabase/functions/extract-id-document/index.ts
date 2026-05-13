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
// gemini-2.5-flash (not the lite variant) — significantly better at
// finding subjects in cluttered photos and reading text at angles.
// The lite variant was failing on mobile photos where the ID card
// occupies less than half the frame.
const MODEL = "google/gemini-2.5-flash";

// Simplified prompt: ONLY two fields (English name + expiry date)
// per user request. Less surface area to fail; faster response.
const EXTRACTION_PROMPT = `You are reading a Kuwait Civil ID card or a Kuwait Driving License from a photograph.

The photo may be a clean cropped image OR a mobile photo where the card occupies only part of the frame and may be slightly angled. Locate the card in the image first, then extract these TWO fields only:

1. The English name of the document holder (printed in Latin letters, usually after the label "Name"). On a Kuwait Civil ID this looks like: "MOHAMMAD SALIM MAKRANI"
2. The expiry date (labeled "Expiry Date" in English or "تاريخ الانتهاء" in Arabic). On the card it is printed as DD/MM/YYYY (e.g. "01/03/2026" means 1 March 2026).

Return ONLY a JSON object — no markdown fences, no commentary, no extra fields — in this exact shape:

{
  "name": string | null,
  "expiry_date": string | null,
  "document_type": "civil_id" | "driving_license" | "other",
  "is_kuwaiti_id_or_license": boolean
}

Rules:
- The expiry_date MUST be in YYYY-MM-DD format. Convert DD/MM/YYYY → YYYY-MM-DD (e.g. "01/03/2026" → "2026-03-01"). Never confuse day and month.
- If the image is not a Kuwait civil ID or driving license, set is_kuwaiti_id_or_license=false and both name and expiry_date to null.
- If you can read the name but not the expiry date (or vice versa), populate the one you can read and set the other to null. Do NOT guess.
- The name field should be in ALL CAPS, exactly as printed on the card.`;

interface ExtractedFields {
  name: string | null;
  expiry_date: string | null;
  document_type: "civil_id" | "driving_license" | "other";
  is_kuwaiti_id_or_license: boolean;
  // Legacy fields — always null in this simplified prompt. Kept in the
  // shape so the frontend (which still has the columns from the
  // permit_attachments table) doesn't break.
  id_number: null;
  issue_date: null;
  nationality: null;
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
    if (typeof parsed !== "object" || parsed === null) return null;

    // Validate expiry_date format — must be YYYY-MM-DD. If the model
    // returned a different shape (like DD/MM/YYYY despite instructions),
    // try to convert; otherwise null it out rather than poison the row.
    let expiryDate: string | null = null;
    if (typeof parsed.expiry_date === "string") {
      const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parsed.expiry_date);
      const dmy = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(parsed.expiry_date);
      if (ymd) {
        expiryDate = parsed.expiry_date;
      } else if (dmy) {
        const [, d, m, y] = dmy;
        expiryDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }

    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : null,
      expiry_date: expiryDate,
      document_type:
        parsed.document_type === "civil_id" ||
        parsed.document_type === "driving_license" ||
        parsed.document_type === "other"
          ? parsed.document_type
          : "other",
      is_kuwaiti_id_or_license: Boolean(parsed.is_kuwaiti_id_or_license),
      id_number: null,
      issue_date: null,
      nationality: null,
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

    // Always log the raw model response — invaluable when debugging
    // OCR failures. Truncate to keep the log readable.
    console.log(
      `[extract-id-document] Model ${MODEL} returned:`,
      typeof content === "string" ? content.slice(0, 600) : "<no content>",
    );

    if (!content) {
      console.error("AI response had no content:", JSON.stringify(aiJson).slice(0, 800));
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

    // Log the extracted fields for observability (no PII concern in
    // this context — admins already see this data when reviewing
    // permits, and the logs are admin-only).
    console.log(
      `[extract-id-document] Extracted: name=${extracted.name}, ` +
      `expiry=${extracted.expiry_date}, ` +
      `is_kuwaiti=${extracted.is_kuwaiti_id_or_license}`,
    );

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
