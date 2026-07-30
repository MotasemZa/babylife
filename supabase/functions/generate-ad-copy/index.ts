import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { title, description, price, platform, tone, targetAudience, usps } = await req.json();
    if (!title) return new Response(JSON.stringify({ error: "Title is required" }), { status: 400, headers: corsHeaders });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: corsHeaders });

    const platformInstructions = platform === "facebook" || platform === "instagram"
      ? `Generate Facebook/Instagram ad copy:
- primary_text: 125 chars max, compelling hook
- headline: 40 chars max
- description: 30 chars max  
- cta: one of "Shop Now", "Learn More", "Get Offer", "Sign Up"
Return as JSON: { "primary_text": "...", "headline": "...", "description": "...", "cta": "..." }`
      : `Generate Google Ads copy:
- 5 headlines, each max 30 characters
- 3 descriptions, each max 90 characters
Return as JSON: { "headlines": ["..."], "descriptions": ["..."] }`;

    const prompt = `You are an expert digital advertising copywriter. Create compelling ad copy for this product:

Product: ${title}
${description ? `Description: ${description}` : ""}
${price ? `Price: ${price}` : ""}
${tone ? `Tone: ${tone}` : "Tone: Professional and compelling"}
${targetAudience ? `Target Audience: ${targetAudience}` : ""}
${usps ? `Key Selling Points: ${usps}` : ""}

${platformInstructions}

Make the copy action-oriented, benefit-focused, and optimized for click-through rate. Strictly respect character limits.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an expert ad copywriter. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again later" }), { status: 429, headers: corsHeaders });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: corsHeaders });
      return new Response(JSON.stringify({ error: "AI generation failed" }), { status: 500, headers: corsHeaders });
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    let adCopy;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      adCopy = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content };
    } catch {
      adCopy = { raw: content };
    }

    // Deduct 1 AI credit
    const { data: settings } = await supabase
      .from("user_settings")
      .select("ai_credits")
      .eq("user_id", user.id)
      .single();

    if (settings) {
      await supabase
        .from("user_settings")
        .update({ ai_credits: Math.max(0, (settings.ai_credits || 0) - 1) })
        .eq("user_id", user.id);

      await supabase.from("credit_transactions").insert({
        user_id: user.id,
        amount: -1,
        type: "ad_copy_generation",
        description: `Ad copy for: ${title} (${platform || "google_ads"})`,
      });
    }

    return new Response(JSON.stringify({ adCopy, platform: platform || "google_ads" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-ad-copy error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
