import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function authenticateUser(authHeader: string | null) {
  if (!authHeader) throw { status: 401, message: "Authorization required" };
  return authHeader.replace("Bearer ", "");
}

async function callAI(apiKey: string, messages: any[], model = "google/gemini-2.5-flash", maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
    });

    if (!res.ok) {
      const status = res.status;
      if (status === 429) throw { status: 429, message: "Rate limit exceeded, please try again later." };
      if (status === 402) throw { status: 402, message: "AI credits exhausted. Please add credits." };
      
      // Retry on 503 / 502 / 500 transient errors
      if ((status === 503 || status === 502 || status === 500) && attempt < maxRetries - 1) {
        const errText = await res.text();
        console.warn(`AI transient error (attempt ${attempt + 1}/${maxRetries}): ${status} ${errText.slice(0, 200)}`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      
      const errText = await res.text();
      console.error("AI error:", status, errText);
      throw { status: 500, message: "AI processing failed" };
    }

    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || "[]";
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return content;
  }
  throw { status: 500, message: "AI processing failed after retries" };
}

function parseJsonArray(content: string): any[] {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {
        // Try repairing truncated JSON by closing open object/array
        let truncated = match[0].trim();
        for (const suffix of ["}]", "]", "\"}]"]) {
          try {
            const repaired = JSON.parse(truncated + suffix);
            console.log(`Repaired truncated JSON with suffix "${suffix}", got ${repaired.length} items`);
            return repaired;
          } catch { /* try next */ }
        }
      }
    }
    console.error("Failed to parse AI output:", content.slice(0, 500));
    return [];
  }
}

// ─── REORGANIZE action ──────────────────────────────
function extractTitle(row: any): string {
  const keys = Object.keys(row);
  const titleKey = keys.find(k => /^(title|name|product|item|description)/i.test(k)) || keys[0];
  return ((row[titleKey] || "") as string).toString().substring(0, 160);
}

async function handleReorganize(rows: any[], context: string, apiKey: string) {
  const capped = rows.slice(0, 500);
  const compact = capped.map((row, i) => ({ i, t: extractTitle(row) }));

  // Pre-extract brand hints: first 1-2 words appearing in 2+ titles
  const wordCounts = new Map<string, number>();
  for (const item of compact) {
    const words = item.t.split(/\s+/);
    // Try 2-word prefix first, then 1-word
    for (const len of [2, 1]) {
      if (words.length >= len) {
        const prefix = words.slice(0, len).join(' ');
        if (prefix.length >= 3) {
          wordCounts.set(prefix, (wordCounts.get(prefix) || 0) + 1);
        }
      }
    }
  }
  const brandHints = Array.from(wordCounts.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([word, count]) => `${word} (${count}x)`);
  console.log(`Extracted ${brandHints.length} brand hints:`, brandHints.slice(0, 15));

  const BATCH_SIZE = 50;
  const allResults: any[] = [];

  for (let offset = 0; offset < compact.length; offset += BATCH_SIZE) {
    const chunk = compact.slice(offset, offset + BATCH_SIZE);
    console.log(`Reorganize batch ${offset / BATCH_SIZE + 1}: rows ${offset}-${offset + chunk.length - 1}`);

    const prompt = `Classify these ${chunk.length} product titles into a 3-level hierarchy: Family → Product → Variant.

Data: ${JSON.stringify(chunk)}
Context: "${context || "Products for listing"}"
${brandHints.length > 0 ? `\nKnown brand/vendor names detected across all products: ${brandHints.join(', ')}\nUse these as familyKey hints — products starting with these names likely belong to that family.` : ''}

Rules:
1. FAMILY = brand/vendor/software suite name (e.g. "Affinity", "CorelDRAW", "ACDSee", "Pinnacle Studio", "NCH", "Klevgrand"). Families are NOT sellable items — they are grouping headers.
2. PRODUCT = a specific sellable software product under a family (e.g. "Affinity Photo V1", "CorelDRAW Graphics Suite 2025"). Each product is a parent.
3. VARIANT = same product differing only by device count, license type, duration, user count (e.g. "1 Device", "5 Devices", "Perpetual / Unlimited").
4. If a row is JUST a brand name with no specific product info, mark type:"family", status:"skip".
5. Different software versions or different products = separate products, NOT variants of each other.
6. Flag junk rows (headers, empty, category labels) as type:"junk", status:"skip".
7. Pick one representative row per product group as isParent:true.
8. CRITICAL: Every software product has a vendor/brand. ALWAYS assign a familyKey. A product without a familyKey is WRONG unless it is truly unknown.
9. The familyKey should be the brand/vendor name, NOT the full product name.

Return JSON array: [{ originalIndex, familyKey, groupKey, variantLabel, isParent, type, status, skipReason }]
- type: "family" | "product" | "variant" | "junk"
- familyKey: the brand/family name this item belongs to
- groupKey: the specific product name (for products and variants)
- For type:"family" or "junk", set status:"skip"
- For type:"product", set isParent:true, status:"process"
- For type:"variant", set isParent:false, status:"process"
IMPORTANT: originalIndex values must match the "i" values from the input data exactly.`;

    const content = await callAI(apiKey, [
      { role: "system", content: "Product data classifier. Return valid JSON arrays only." },
      { role: "user", content: prompt },
    ], "google/gemini-2.5-flash");

    const batchResult = parseJsonArray(content);
    console.log(`Batch returned ${batchResult.length} items for ${chunk.length} input rows`);

    // Ensure originalIndex values are correct (AI might use local 0-based indices)
    for (const item of batchResult) {
      if (item.originalIndex < offset && offset > 0) {
        item.originalIndex += offset;
      }
      allResults.push(item);
    }
  }

  // Build a set of covered indices
  const covered = new Set(allResults.map((r: any) => r.originalIndex));
  for (let i = 0; i < capped.length; i++) {
    if (!covered.has(i)) {
      allResults.push({
        originalIndex: i,
        groupKey: extractTitle(capped[i]) || `Product ${i + 1}`,
        variantLabel: "",
        isParent: false,
        status: "process",
        skipReason: "",
      });
    }
  }

  return allResults;
}

// ─── PREPARE action (existing content generation) ───
async function handlePrepare(rows: any[], context: string, searchImages: boolean, apiKey: string, metafieldDefinitions?: any[]) {
  const headers = Object.keys(rows[0]);
  const sampleRows = rows.slice(0, 5);

  // Build metafields section for AI prompt
  let metafieldsPrompt = '';
  if (metafieldDefinitions && metafieldDefinitions.length > 0) {
    const metaList = metafieldDefinitions.map((m: any) =>
      `- "${m.namespace}.${m.key}" (name: "${m.name}", type: ${m.type}${m.description ? `, description: ${m.description}` : ''})`
    ).join('\n');
    metafieldsPrompt = `
Additionally, the Shopify store has these custom metafield definitions. Generate appropriate values for each:
${metaList}

Include a "metafields" object in each result where keys are "namespace.key" and values are the generated content. Use appropriate types (strings for text fields, numbers for number fields, etc.). If you cannot determine a good value for a metafield, omit it.`;
  }

  const mappingPrompt = `You are an e-commerce listing assistant. The user uploaded a spreadsheet with these columns: ${JSON.stringify(headers)}

Here are sample rows: ${JSON.stringify(sampleRows)}

The user described the data as: "${context || "Digital products for listing on Shopify"}"

For EACH row in the full dataset below, generate optimized Shopify listing fields. Return a JSON array where each element has:
- title: optimized product title for SEO (keep the full product name, version, and platform info)
- description: a rich HTML product description with these sections:
  <h3>Overview</h3> (2-3 sentence compelling product intro explaining what it does and who it's for)
  <h3>Key Features</h3> (<ul> bullet list of 3-5 standout features or capabilities)
  <h3>How to Activate</h3> (step-by-step instructions: 1. Purchase 2. Receive key 3. Go to vendor site 4. Redeem — tailor to the product type)
  <h3>What's Included</h3> (<ul> list: license type, platform compatibility, number of devices, duration)
- price: the price as a string (number only, no currency symbol)
- tags: comma-separated relevant tags for discoverability
- productType: product category (e.g. "Software", "Game Key", "Subscription")
- searchQuery: a web search query to find a product image for this item${metafieldsPrompt}

Full dataset (${rows.length} rows):
${JSON.stringify(rows)}

Return ONLY the JSON array, no markdown fences.`;

  const content = await callAI(apiKey, [
    { role: "system", content: "You are a product listing optimizer. Always return valid JSON arrays." },
    { role: "user", content: mappingPrompt },
  ]);

  let listings = parseJsonArray(content);

  // Ensure we have an entry for each row
  if (listings.length < rows.length) {
    for (let i = listings.length; i < rows.length; i++) {
      const row = rows[i];
      const firstVal = Object.values(row)[0] as string;
      listings.push({
        title: firstVal || `Product ${i + 1}`,
        description: "",
        price: "0",
        tags: "",
        productType: "",
        searchQuery: firstVal || "",
      });
    }
  }

  // Helper: filter junk image URLs (logos, favicons, tiny thumbs, SVGs)
  const isJunkImage = (url: string): boolean => {
    const lower = url.toLowerCase();
    return lower.includes('logo') || lower.includes('favicon') ||
      lower.includes('icon') || lower.endsWith('.svg') ||
      lower.includes('maxlength=70') || lower.includes('plogos') ||
      lower.includes('placeholder') || lower.includes('spinner') ||
      lower.includes('spacer') || lower.includes('pixel.gif') ||
      lower.includes('1x1') || lower.includes('blank.');
  };

  // Helper: extract existing row images (from scrape-product-url or CSV)
  const getOriginalRowImages = (row: any): string[] => {
    const imgStr = (row?.images || row?.Images || row?.image || row?.Image || row?.image_urls || '').toString().trim();
    if (!imgStr) return [];
    return imgStr.split('|')
      .map((u: string) => u.trim())
      .filter((u: string) => u && u.startsWith('http') && !isJunkImage(u));
  };

  // Helper: get source URL from a row (web imports include this)
  const getSourceUrl = (row: any): string | null => {
    const url = (row?.SourceUrl || row?.sourceUrl || row?.source_url || row?.url || row?.URL || '').toString().trim();
    return (url && url.startsWith('http')) ? url : null;
  };

  // Helper: scrape images directly from a product page URL via Firecrawl /v1/scrape
  const scrapeImagesFromUrl = async (url: string, firecrawlKey: string): Promise<string[]> => {
    try {
      const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: false,
        }),
      });
      if (!scrapeRes.ok) {
        console.warn(`Firecrawl scrape failed for ${url}: ${scrapeRes.status}`);
        return [];
      }
      const scrapeData = await scrapeRes.json();
      const result = scrapeData.data || scrapeData;
      const imageUrls: string[] = [];
      const seen = new Set<string>();

      const addImg = (u: string) => {
        if (u && u.startsWith('http') && !seen.has(u) && !isJunkImage(u)) {
          seen.add(u);
          imageUrls.push(u);
        }
      };

      // Extract from metadata
      if (result.metadata) {
        addImg(result.metadata.ogImage || '');
        addImg(result.metadata['og:image'] || '');
        addImg(result.metadata.image || '');
        addImg(result.metadata['twitter:image'] || '');
      }

      // Extract from markdown content
      if (result.markdown) {
        const mdImgRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
        let match;
        while ((match = mdImgRegex.exec(result.markdown)) !== null) {
          addImg(match[1]);
        }
        // Also find bare image URLs
        const bareImgRegex = /(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?)/gi;
        while ((match = bareImgRegex.exec(result.markdown)) !== null) {
          addImg(match[1]);
        }
      }

      return imageUrls;
    } catch (err) {
      console.error(`scrapeImagesFromUrl error for ${url}:`, err);
      return [];
    }
  };

  // Image enrichment via Firecrawl
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  console.log(`Image enrichment: searchImages=${searchImages}, hasFirecrawl=${!!FIRECRAWL_API_KEY}`);

  if (searchImages && FIRECRAWL_API_KEY) {
    console.log("Enriching images for", listings.length, "products");
    for (let i = 0; i < listings.length; i += 5) {
      const batch = listings.slice(i, i + 5);
      const promises = batch.map(async (listing: any, idx: number) => {
        const rowIdx = i + idx;
        try {
          // Strategy 1: Direct scrape if we have a source URL (web imports)
          const sourceUrl = getSourceUrl(rows[rowIdx]);
          if (sourceUrl) {
            console.log(`[${rowIdx}] Direct scrape: ${sourceUrl}`);
            const scraped = await scrapeImagesFromUrl(sourceUrl, FIRECRAWL_API_KEY!);
            if (scraped.length > 0) {
              listings[rowIdx].imageUrls = scraped.slice(0, 5);
              listings[rowIdx].imageSearched = true;
              listings[rowIdx].imageSearchNote = `Direct scrape: ${scraped.length} images found`;
              return;
            }
            console.log(`[${rowIdx}] Direct scrape returned 0 images, falling back to search`);
          }

          // Strategy 2: Firecrawl search fallback (CSV imports or direct scrape failed)
          const query = listing.searchQuery || listing.title;
          if (!query) return;
          console.log(`[${rowIdx}] Search fallback: "${query}"`);

          const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `${query} product image`,
              limit: 5,
              scrapeOptions: { formats: ["markdown"] },
            }),
          });
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const imageUrls: string[] = [];
            const seen = new Set<string>();

            const addImage = (url: string) => {
              if (url && url.startsWith('http') && !seen.has(url) && !isJunkImage(url)) {
                seen.add(url);
                imageUrls.push(url);
              }
            };

            if (searchData.data) {
              for (const result of searchData.data) {
                if (result.metadata?.ogImage) addImage(result.metadata.ogImage);
                if (result.metadata?.image) addImage(result.metadata.image);
                if (result.metadata?.['og:image']) addImage(result.metadata['og:image']);
                if (result.metadata?.['twitter:image']) addImage(result.metadata['twitter:image']);

                if (result.markdown) {
                  const imgRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
                  let match;
                  while ((match = imgRegex.exec(result.markdown)) !== null) {
                    addImage(match[1]);
                  }
                }
              }
            }

            console.log(`[${rowIdx}] Search found ${imageUrls.length} candidates`);
            if (imageUrls.length > 0) {
              listings[rowIdx].imageUrls = imageUrls.slice(0, 5);
            } else {
              // Fallback: preserve original row images
              const originals = getOriginalRowImages(rows[rowIdx]);
              listings[rowIdx].imageUrls = originals.slice(0, 5);
              listings[rowIdx].imageSearchNote = originals.length > 0
                ? "Using original scraped images (search returned no results)"
                : "No product images found";
            }
            listings[rowIdx].imageSearched = true;
          } else {
            console.error(`[${rowIdx}] Search HTTP error:`, searchRes.status);
            const originals = getOriginalRowImages(rows[rowIdx]);
            listings[rowIdx].imageUrls = originals.slice(0, 5);
            listings[rowIdx].imageSearched = true;
          }
        } catch (err) {
          console.error(`Image enrichment error for [${rowIdx}]:`, err);
          const originals = getOriginalRowImages(rows[rowIdx]);
          listings[rowIdx].imageUrls = originals.slice(0, 5);
          listings[rowIdx].imageSearched = true;
        }
      });
      await Promise.all(promises);
      if (i + 5 < listings.length) await new Promise((r) => setTimeout(r, 500));
    }
  } else if (searchImages && !FIRECRAWL_API_KEY) {
    for (let i = 0; i < listings.length; i++) {
      const originals = getOriginalRowImages(rows[i]);
      listings[i].imageUrls = originals.slice(0, 5);
      listings[i].imageSearchNote = originals.length > 0
        ? "Using original scraped images (Firecrawl not configured)"
        : "Connect Firecrawl in Settings to enable automatic image search";
    }
  }

  return { listings, imagesSearched: searchImages && !!FIRECRAWL_API_KEY };
}

// ─── Main handler ───────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authenticateUser(authHeader);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, rows, context, searchImages, metafieldDefinitions } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reorganize") {
      const result = await handleReorganize(rows, context || "", LOVABLE_API_KEY);
      return new Response(
        JSON.stringify({ success: true, reorganized: result, totalRows: rows.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reorganize-batch") {
      const { brandHints, batchOffset } = body;
      const compact = rows; // already compact [{i, t}] from client
      const offset = batchOffset || 0;

      console.log(`Reorganize-batch: ${compact.length} rows, offset ${offset}, ${(brandHints || []).length} brand hints`);

      const prompt = `Classify these ${compact.length} product titles into a 3-level hierarchy: Family → Product → Variant.

Data: ${JSON.stringify(compact)}
Context: "${context || "Products for listing"}"
${(brandHints || []).length > 0 ? `\nKnown brand/vendor names detected across all products: ${brandHints.join(', ')}\nUse these as familyKey hints — products starting with these names likely belong to that family.` : ''}

Rules:
1. FAMILY = brand/vendor/software suite name (e.g. "Affinity", "CorelDRAW", "ACDSee", "Pinnacle Studio", "NCH", "Klevgrand"). Families are NOT sellable items — they are grouping headers.
2. PRODUCT = a specific sellable software product under a family (e.g. "Affinity Photo V1", "CorelDRAW Graphics Suite 2025"). Each product is a parent.
3. VARIANT = same product differing only by device count, license type, duration, user count (e.g. "1 Device", "5 Devices", "Perpetual / Unlimited").
4. If a row is JUST a brand name with no specific product info, mark type:"family", status:"skip".
5. Different software versions or different products = separate products, NOT variants of each other.
6. Flag junk rows (headers, empty, category labels) as type:"junk", status:"skip".
7. Pick one representative row per product group as isParent:true.
8. CRITICAL: Every software product has a vendor/brand. ALWAYS assign a familyKey. A product without a familyKey is WRONG unless it is truly unknown.
9. The familyKey should be the brand/vendor name, NOT the full product name.

Return JSON array: [{ originalIndex, familyKey, groupKey, variantLabel, isParent, type, status, skipReason }]
- type: "family" | "product" | "variant" | "junk"
- familyKey: the brand/family name this item belongs to
- groupKey: the specific product name (for products and variants)
- For type:"family" or "junk", set status:"skip"
- For type:"product", set isParent:true, status:"process"
- For type:"variant", set isParent:false, status:"process"
IMPORTANT: originalIndex values must match the "i" values from the input data exactly.`;

      const content = await callAI(LOVABLE_API_KEY, [
        { role: "system", content: "Product data classifier. Return valid JSON arrays only." },
        { role: "user", content: prompt },
      ], "google/gemini-2.5-flash");

      const batchResult = parseJsonArray(content);

      // Count unique families found
      const familiesFound = new Set(batchResult.filter((r: any) => r.familyKey).map((r: any) => r.familyKey));

      return new Response(
        JSON.stringify({ success: true, results: batchResult, familiesFound: familiesFound.size }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: prepare action (content generation)
    const { listings, imagesSearched } = await handlePrepare(rows, context || "", searchImages ?? true, LOVABLE_API_KEY, metafieldDefinitions);
    return new Response(
      JSON.stringify({ success: true, listings, totalProcessed: listings.length, imagesSearched }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    const status = error.status || 500;
    const message = error.message || (error instanceof Error ? error.message : "Unknown error");
    console.error("Error in bulk-listing-prepare:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
