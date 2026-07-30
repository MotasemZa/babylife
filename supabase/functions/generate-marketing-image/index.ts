import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Parse a product title into a canonical record
function parseProductRecord(title: string, description?: string, price?: string, features?: string) {
  const record: Record<string, string> = {
    raw_title: title,
    vendor: "unknown",
    product_name: title,
    edition: "unknown",
    version: "unknown",
    platform: "unknown",
    license_type: "unknown",
    seat_count: "unknown",
    region: "unknown",
  };

  // Try to extract vendor
  const knownVendors = [
    "Microsoft", "Adobe", "Norton", "McAfee", "Kaspersky", "Bitdefender",
    "Autodesk", "VMware", "Parallels", "Corel", "ESET", "Avast", "AVG",
    "Trend Micro", "Sophos", "Malwarebytes", "NordVPN", "ExpressVPN",
    "Surfshark", "CyberGhost", "Apple", "Google", "Intuit", "QuickBooks",
  ];
  for (const v of knownVendors) {
    if (title.toLowerCase().includes(v.toLowerCase())) {
      record.vendor = v;
      break;
    }
  }

  // Extract version/year
  const yearMatch = title.match(/\b(20\d{2})\b/);
  if (yearMatch) record.version = yearMatch[1];

  // Extract edition
  const editions = ["Home", "Pro", "Professional", "Enterprise", "Business", "Ultimate", "Premium", "Standard", "Deluxe", "Plus", "Basic"];
  for (const ed of editions) {
    if (title.toLowerCase().includes(ed.toLowerCase())) {
      record.edition = ed;
      break;
    }
  }

  // Extract seat/device count
  const seatMatch = title.match(/(\d+)\s*(?:device|pc|user|seat|license)/i);
  if (seatMatch) record.seat_count = seatMatch[1];

  // Platform hints
  const platforms = ["Windows", "Mac", "macOS", "Linux", "Android", "iOS"];
  for (const p of platforms) {
    if (title.toLowerCase().includes(p.toLowerCase()) || (description || "").toLowerCase().includes(p.toLowerCase())) {
      record.platform = p;
      break;
    }
  }

  return record;
}

// Search for real product images using Firecrawl
async function searchProductImages(title: string, vendor: string, firecrawlKey: string): Promise<{ urls: string[]; sources: string[] }> {
  const urls: string[] = [];
  const sources: string[] = [];

  try {
    // Search for the product
    const searchQuery = vendor !== "unknown"
      ? `${vendor} ${title} official product image box art`
      : `${title} official product image software`;

    const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 5,
        scrapeOptions: { formats: ["markdown", "links"] },
      }),
    });

    if (!searchRes.ok) {
      console.error("Firecrawl search failed:", searchRes.status);
      return { urls, sources };
    }

    const searchData = await searchRes.json();
    const results = searchData.data || [];

    // Extract image URLs from results
    for (const result of results) {
      const sourceUrl = result.url || "";
      const markdown = result.markdown || "";

      // Extract image URLs from markdown
      const imgMatches = markdown.matchAll(/!\[.*?\]\((https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s)]*)?)\)/gi);
      for (const m of imgMatches) {
        const imgUrl = m[1];
        // Filter out junk
        if (isRealProductImage(imgUrl, title)) {
          urls.push(imgUrl);
          sources.push(sourceUrl);
        }
      }

      // Also check for direct image links in HTML-style img tags in markdown
      const imgTagMatches = markdown.matchAll(/(?:src|href)=["'](https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"']*)?)/gi);
      for (const m of imgTagMatches) {
        const imgUrl = m[1];
        if (isRealProductImage(imgUrl, title)) {
          urls.push(imgUrl);
          sources.push(sourceUrl);
        }
      }
    }
  } catch (e) {
    console.error("Firecrawl search error:", e);
  }

  // Deduplicate
  const seen = new Set<string>();
  const dedupUrls: string[] = [];
  const dedupSources: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    if (!seen.has(urls[i])) {
      seen.add(urls[i]);
      dedupUrls.push(urls[i]);
      dedupSources.push(sources[i]);
    }
  }

  return { urls: dedupUrls.slice(0, 5), sources: dedupSources.slice(0, 5) };
}

function isRealProductImage(url: string, title: string): boolean {
  const lower = url.toLowerCase();
  // Reject obvious junk
  if (/logo|favicon|icon|sprite|avatar|badge|banner-ad|tracking|pixel|1x1|spacer/i.test(lower)) return false;
  if (lower.endsWith(".svg") || lower.endsWith(".gif")) return false;
  // Must be reasonably sized (heuristic: URL shouldn't contain tiny dimensions)
  if (/(?:^|\D)(?:1[0-9]|[1-9])x(?:1[0-9]|[1-9])(?:\D|$)/.test(lower)) return false;
  return true;
}

// Calculate confidence based on how many product record fields match
function calculateConfidence(record: Record<string, string>, imageUrls: string[], imageSources: string[]): { score: number; missingFields: string[] } {
  const missing: string[] = [];
  let matched = 0;
  let total = 0;

  const fields = ["vendor", "product_name", "edition", "version"];
  for (const f of fields) {
    total++;
    if (record[f] && record[f] !== "unknown") matched++;
    else missing.push(f);
  }

  // Bonus for having real images from trusted sources
  const trustedDomains = ["microsoft.com", "adobe.com", "norton.com", "mcafee.com", "kaspersky.com", "amazon.com", "bestbuy.com"];
  const hasTrustedSource = imageSources.some(s => trustedDomains.some(d => s.includes(d)));
  if (hasTrustedSource) matched += 1;
  total += 1;

  // Bonus for multiple images found
  if (imageUrls.length >= 2) matched += 1;
  total += 1;

  const score = Math.round((matched / total) * 100);
  return { score, missingFields: missing };
}

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

    const { title, description, price, features, imageType } = await req.json();
    if (!title) return new Response(JSON.stringify({ error: "Title is required" }), { status: 400, headers: corsHeaders });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: corsHeaders });

    // Check credits
    const { data: settings } = await supabase
      .from("user_settings")
      .select("ai_credits")
      .eq("user_id", user.id)
      .single();

    if (!settings || (settings.ai_credits || 0) < 1) {
      return new Response(JSON.stringify({ error: "Not enough AI credits" }), { status: 402, headers: corsHeaders });
    }

    // Step 1: Parse canonical product record
    const productRecord = parseProductRecord(title, description, price, features);
    console.log("Product record:", JSON.stringify(productRecord));

    // Step 2: Try to find real product images via Firecrawl
    const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    let searchedImageUrls: string[] = [];
    let searchedSources: string[] = [];
    let imageSource = "ai_generated";

    if (FIRECRAWL_KEY) {
      console.log("Searching for real product images...");
      const searchResult = await searchProductImages(title, productRecord.vendor, FIRECRAWL_KEY);
      searchedImageUrls = searchResult.urls;
      searchedSources = searchResult.sources;
      console.log(`Found ${searchedImageUrls.length} candidate images`);
    }

    // Step 3: Calculate confidence
    const confidence = calculateConfidence(productRecord, searchedImageUrls, searchedSources);
    console.log(`Confidence: ${confidence.score}%, missing: ${confidence.missingFields.join(", ")}`);

    let publicUrl: string;

    if (searchedImageUrls.length > 0 && confidence.score >= 50) {
      // Use the best real product image found
      imageSource = "verified_search";
      const bestImageUrl = searchedImageUrls[0];
      console.log("Using verified image:", bestImageUrl);

      // Download and re-upload to our storage for permanence
      try {
        const imgRes = await fetch(bestImageUrl);
        if (imgRes.ok) {
          const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
          const ext = bestImageUrl.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || "png";
          const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
          const fileName = `${user.id}/${Date.now()}-${imageType}-verified.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("marketing-assets")
            .upload(fileName, imgBytes, { contentType, upsert: false });

          if (uploadError) {
            console.error("Upload error, falling back to direct URL:", uploadError);
            publicUrl = bestImageUrl;
          } else {
            const { data: urlData } = supabase.storage.from("marketing-assets").getPublicUrl(fileName);
            publicUrl = urlData.publicUrl;
          }
        } else {
          // Download failed, fall through to AI
          publicUrl = "";
        }
      } catch (dlErr) {
        console.error("Download error:", dlErr);
        publicUrl = "";
      }
    }

    // Step 4: Fall back to AI generation if no real image
    if (!publicUrl!) {
      imageSource = "ai_generated";
      console.log("Falling back to AI image generation");

      const prompts: Record<string, string> = {
        product_showcase: `Create a professional, clean product showcase image for "${title}". ${description ? `Product: ${description}.` : ""} ${features ? `Features: ${features}.` : ""} Modern design with subtle gradients, the product name "${title}" displayed prominently in elegant typography. Professional marketing quality, suitable for e-commerce. No watermarks. On a clean background.`,
        pricing_banner: `Create a bold pricing banner image for "${title}" showing the price ${price || ""}. ${description ? `Product: ${description}.` : ""} Eye-catching design with strong contrast, the price displayed very large and prominent, product name clear. Sale/promotional style. Modern, professional marketing banner. No watermarks.`,
        social_post: `Create a square social media post image for "${title}". ${description ? `${description}.` : ""} ${price ? `Price: ${price}.` : ""} ${features ? `Key features: ${features}.` : ""} Instagram-ready, visually striking, modern design with bold typography. Include a subtle call-to-action feel. Professional quality. No watermarks.`,
        feature_card: `Create a feature highlight card for "${title}" showcasing: ${features || description || "key product features"}. Clean infographic style with icons or visual elements representing each feature. Modern, professional design. Product name at top. No watermarks.`,
      };

      const prompt = prompts[imageType] || prompts.product_showcase;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again later" }), { status: 429, headers: corsHeaders });
        if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: corsHeaders });
        const errText = await response.text();
        console.error("AI error:", response.status, errText);
        return new Response(JSON.stringify({ error: "AI generation failed" }), { status: 500, headers: corsHeaders });
      }

      const aiData = await response.json();
      const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!imageData) {
        return new Response(JSON.stringify({ error: "No image generated" }), { status: 500, headers: corsHeaders });
      }

      const base64 = imageData.replace(/^data:image\/\w+;base64,/, "");
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const fileName = `${user.id}/${Date.now()}-${imageType}-ai.png`;

      const { error: uploadError } = await supabase.storage
        .from("marketing-assets")
        .upload(fileName, bytes, { contentType: "image/png", upsert: false });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return new Response(JSON.stringify({ error: "Failed to save image" }), { status: 500, headers: corsHeaders });
      }

      const { data: urlData } = supabase.storage.from("marketing-assets").getPublicUrl(fileName);
      publicUrl = urlData.publicUrl;

      // Lower confidence for AI-generated
      confidence.score = Math.min(confidence.score, 40);
    }

    // Save record
    const { data: record, error: insertError } = await supabase
      .from("marketing_videos")
      .insert({
        user_id: user.id,
        title: `${title} - ${imageType.replace(/_/g, " ")}`,
        product_ids: [],
        status: "ready",
        content_type: imageType,
        image_url: publicUrl,
        script: {},
        duration_seconds: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save record" }), { status: 500, headers: corsHeaders });
    }

    // Deduct credit
    await supabase
      .from("user_settings")
      .update({ ai_credits: Math.max(0, (settings.ai_credits || 0) - 1) })
      .eq("user_id", user.id);

    await supabase.from("credit_transactions").insert({
      user_id: user.id,
      amount: -1,
      type: "marketing_image",
      description: `${imageType.replace(/_/g, " ")} for: ${title}`,
    });

    return new Response(JSON.stringify({
      record,
      imageUrl: publicUrl,
      canonical_product_record: productRecord,
      chosen_source: imageSource,
      confidence_score: confidence.score,
      missing_fields: confidence.missingFields,
      notes: imageSource === "verified_search"
        ? `Image sourced from web search (${searchedSources[0] || "unknown"}). Confidence: ${confidence.score}%.`
        : `AI-generated image. Product could not be verified with high confidence. Missing: ${confidence.missingFields.join(", ") || "none"}.`,
      final_action_taken: imageSource === "verified_search" ? "used_verified_image" : "ai_fallback",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-marketing-image error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
