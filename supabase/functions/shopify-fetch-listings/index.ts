import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Shopify credentials
    const { data: credentials, error: credError } = await supabase
      .from("user_shopify_credentials")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (credError || !credentials?.access_token) {
      return new Response(
        JSON.stringify({ error: "Shopify not connected. Please connect your store first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { shop_domain, access_token } = credentials;

    // Fetch products from Shopify
    const productsUrl = `https://${shop_domain}/admin/api/2024-01/products.json?status=active&limit=250`;
    
    const response = await fetch(productsUrl, {
      headers: {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Shopify API error:", errorText);
      return new Response(
        JSON.stringify({ error: `Shopify API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const products = data.products || [];

    // Transform products to a standardized format
    const listings = products.flatMap((product: any) => {
      // Each variant becomes a listing
      return product.variants.map((variant: any) => ({
        platform: "shopify",
        platformListingId: `${product.id}_${variant.id}`,
        productId: product.id.toString(),
        variantId: variant.id.toString(),
        title: variant.title !== "Default Title" 
          ? `${product.title} - ${variant.title}` 
          : product.title,
        description: product.body_html?.replace(/<[^>]*>/g, '') || null,
        price: parseFloat(variant.price) || null,
        currency: "USD", // Shopify uses shop currency
        quantity: variant.inventory_quantity || 0,
        sku: variant.sku || null,
        imageUrl: product.image?.src || product.images?.[0]?.src || null,
        listingUrl: `https://${shop_domain}/products/${product.handle}`,
        status: product.status === "active" ? "active" : "inactive",
        raw: { product, variant },
      }));
    });

    return new Response(
      JSON.stringify({ 
        listings, 
        total: listings.length,
        shopDomain: shop_domain,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Shopify fetch listings error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
