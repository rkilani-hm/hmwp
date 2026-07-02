import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `You are an AI copilot for the HM-WP Work Permit and Gate Pass management system.

Help users with:
- Understanding work permit and gate pass workflows and statuses
- Explaining approval processes and role responsibilities
- Drafting or improving permit/gate pass descriptions and purposes
- Navigating the system and common procedures
- General operational guidance for facility management

Keep answers concise, practical, and accurate. If you do not know something, say so. Do not make up policies or data.`;

// Abuse protection — small per-IP burst limit to avoid burning the gateway quota.
const RL_WINDOW_MS = 60_000;
const RL_MAX = 20;
const rlBucket = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rlBucket.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  hits.push(now);
  rlBucket.set(ip, hits);
  return hits.length > RL_MAX;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip") || "unknown";
    if (rateLimited(ip)) {
      return new Response(
        JSON.stringify({ error: "rate_limited", message: "Too many requests. Please wait a minute." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "ai_not_configured",
          message: "AI copilot is not configured. Set LOVABLE_API_KEY to enable it.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "missing_messages", message: "A non-empty messages array is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const messages: ChatMessage[] = [
      { role: "system", content: body.system || SYSTEM_PROMPT },
      ...body.messages.map((m: any) => ({
        role: String(m.role).toLowerCase(),
        content: String(m.content || ""),
      })),
    ];

    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body.model || MODEL,
        messages,
        temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
        max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 2048,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text().catch(() => "");
      const code =
        aiResponse.status === 402 ? "ai_quota_exhausted"
          : aiResponse.status === 429 ? "ai_rate_limited"
          : "ai_request_failed";
      return new Response(
        JSON.stringify({
          error: code,
          message: `AI service returned HTTP ${aiResponse.status}`,
          detail: errText.slice(0, 500),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await aiResponse.json();
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ai-copilot error:", err);
    return new Response(
      JSON.stringify({ error: "internal_error", message: (err as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
