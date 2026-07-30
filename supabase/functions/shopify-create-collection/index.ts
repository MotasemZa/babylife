import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title, shopifyCredentialId } = await req.json();

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Collection title is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Shopify credentials
    let credsQuery = supabase
      .from("user_shopify_credentials")
      .select("shop_domain, access_token, scope")
      .eq("user_id", user.id);

    if (shopifyCredentialId) {
      credsQuery = credsQuery.eq("id", shopifyCredentialId);
    }

    const { data: creds, error: credError } = await credsQuery.limit(1).single();
    if (credError || !creds?.access_token) {
      return new Response(
        JSON.stringify({ error: "Shopify not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shopHeaders = {
      "X-Shopify-Access-Token": creds.access_token,
      "Content-Type": "application/json",
    };

    // Check if collection already exists
    const searchRes = await fetch(
      `https://${creds.shop_domain}/admin/api/2024-01/custom_collections.json?title=${encodeURIComponent(title.trim())}&limit=5`,
      { headers: shopHeaders }
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const existing = (searchData.custom_collections || []).find(
        (c: any) => c.title.toLowerCase() === title.trim().toLowerCase()
      );
      if (existing) {
        return new Response(
          JSON.stringify({ collectionId: existing.id, title: existing.title, created: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create new custom collection
    const createRes = await fetch(
      `https://${creds.shop_domain}/admin/api/2024-01/custom_collections.json`,
      {
        method: "POST",
        headers: shopHeaders,
        body: JSON.stringify({
          custom_collection: { title: title.trim() },
        }),
      }
    );

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("Shopify create collection error:", createRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Shopify API error: ${createRes.status}`, details: errText }),
        { status: createRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const createData = await createRes.json();
    const collection = createData.custom_collection;

    return new Response(
      JSON.stringify({ collectionId: collection.id, title: collection.title, created: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in shopify-create-collection:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
