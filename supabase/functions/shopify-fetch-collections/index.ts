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

    // Parse optional shopifyCredentialId from query or body
    const url = new URL(req.url);
    let shopifyCredentialId = url.searchParams.get("shopifyCredentialId");
    if (!shopifyCredentialId && req.method === "POST") {
      try {
        const body = await req.json();
        shopifyCredentialId = body.shopifyCredentialId || null;
      } catch { /* no body */ }
    }

    let credsQuery = supabase
      .from("user_shopify_credentials")
      .select("shop_domain, access_token")
      .eq("user_id", user.id);

    if (shopifyCredentialId) {
      credsQuery = credsQuery.eq("id", shopifyCredentialId);
    }

    const { data: creds, error: credError } = await credsQuery.limit(1).single();
    if (credError || !creds?.access_token) {
      return new Response(
        JSON.stringify({ error: "Shopify not connected", collections: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shopHeaders = {
      "X-Shopify-Access-Token": creds.access_token,
      "Content-Type": "application/json",
    };

    // Fetch custom + smart collections in parallel
    const [customRes, smartRes] = await Promise.all([
      fetch(`https://${creds.shop_domain}/admin/api/2024-01/custom_collections.json?limit=250`, { headers: shopHeaders }),
      fetch(`https://${creds.shop_domain}/admin/api/2024-01/smart_collections.json?limit=250`, { headers: shopHeaders }),
    ]);

    const collections: { id: number; title: string; type: string }[] = [];

    if (customRes.ok) {
      const d = await customRes.json();
      for (const c of d.custom_collections || []) {
        collections.push({ id: c.id, title: c.title, type: "custom" });
      }
    }

    if (smartRes.ok) {
      const d = await smartRes.json();
      for (const c of d.smart_collections || []) {
        collections.push({ id: c.id, title: c.title, type: "smart" });
      }
    }

    return new Response(
      JSON.stringify({ collections }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in shopify-fetch-collections:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", collections: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
