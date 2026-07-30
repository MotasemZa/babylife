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

    const { title, description, price, features, style, imageUrls } = await req.json();
    if (!title) return new Response(JSON.stringify({ error: "Title is required" }), { status: 400, headers: corsHeaders });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: corsHeaders });

    const styleGuide = {
      "product_showcase": "Focus on the product itself. Clean, modern aesthetic. Show the product name prominently, then key features one by one, end with price and CTA.",
      "feature_highlight": "Highlight 3-4 key features with bold text animations. Use icons or emojis. Fast-paced, energetic.",
      "sale_promo": "Urgency-driven. Big discount numbers, countdown feel, bold colors. Flash sale energy.",
    };

    const prompt = `You are a social media video scriptwriter. Create a 15-second vertical video (9:16) script for a product reel.

Product: ${title}
${description ? `Description: ${description}` : ""}
${price ? `Price: ${price}` : ""}
${features ? `Key Features: ${features}` : ""}
Style: ${styleGuide[style as keyof typeof styleGuide] || styleGuide.product_showcase}

Return JSON with this structure:
{
  "scenes": [
    {
      "duration_seconds": 3,
      "text_overlay": "Main text shown on screen",
      "sub_text": "Secondary smaller text",
      "background_color": "#hex",
      "text_color": "#hex",
      "animation": "fade_in|slide_up|zoom_in|bounce"
    }
  ],
  "music_mood": "energetic|calm|dramatic|upbeat",
  "aspect_ratio": "9:16",
  "total_duration": 15
}

Create 4-5 scenes that tell a compelling story. Each scene should have impactful, short text (max 8 words per text_overlay). Use bold, contrasting colors.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a video scriptwriter. Return only valid JSON." },
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

    let script;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      script = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content };
    } catch {
      script = { raw: content };
    }

    // Save video record
    const { data: video, error: insertError } = await supabase
      .from("marketing_videos")
      .insert({
        user_id: user.id,
        title: `${title} - ${style || "showcase"} reel`,
        product_ids: [],
        status: "ready",
        script,
        duration_seconds: 15,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save video" }), { status: 500, headers: corsHeaders });
    }

    // Deduct credit
    const { data: settings } = await supabase
      .from("user_settings")
      .select("ai_credits")
      .eq("user_id", user.id)
      .single();

    if (settings) {
      await supabase
        .from("user_settings")
        .update({ ai_credits: Math.max(0, (settings.ai_credits || 0) - 2) })
        .eq("user_id", user.id);

      await supabase.from("credit_transactions").insert({
        user_id: user.id,
        amount: -2,
        type: "video_script_generation",
        description: `Video script for: ${title}`,
      });
    }

    return new Response(JSON.stringify({ video, script }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-marketing-video error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
