// shopify-create-product-with-variants v1.1
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
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title, description, productType, tags, imageUrls, variants, shopifyCredentialId, status, inventoryTracked, physicalProduct, collectionId, metafields } = await req.json();

    if (!title) {
      return new Response(JSON.stringify({ error: "Title is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!variants || !Array.isArray(variants) || variants.length === 0) {
      return new Response(JSON.stringify({ error: "At least one variant is required" }), {
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
        JSON.stringify({ error: "Shopify not connected. Please connect in Connections." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const grantedScopes = (creds.scope || "").split(",").map((s: string) => s.trim()).filter(Boolean);

    if (!grantedScopes.includes("write_products")) {
      return new Response(
        JSON.stringify({
          error: "Shopify connection is missing write_products scope. Please reconnect Shopify.",
          code: "missing_scope",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build Shopify product with variants
    const variantLabels = variants.map((v: any) => v.label || "Default");
    const hasMultipleVariants = variants.length > 1;
    const productStatus = status === 'draft' ? 'draft' : (status === 'unlisted' ? 'draft' : 'active');

    const shopifyProduct: any = {
      product: {
        title,
        body_html: description || "",
        product_type: productType || "",
        tags: Array.isArray(tags) ? tags.join(", ") : (tags || ""),
        status: productStatus,
        variants: variants.map((v: any) => ({
          ...(hasMultipleVariants ? { option1: v.label || "Default" } : {}),
          price: String(v.price || "0"),
          inventory_quantity: v.quantity ?? 1,
          inventory_management: inventoryTracked === false ? null : "shopify",
          requires_shipping: physicalProduct === true,
        })),
      },
    };

    // Add options if multiple variants
    if (hasMultipleVariants) {
      shopifyProduct.product.options = [{ name: "Type", values: variantLabels }];
    }

    // Add images
    if (imageUrls && imageUrls.length > 0) {
      shopifyProduct.product.images = imageUrls.map((url: string) => ({ src: url }));
    }

    // Add metafields — with format fixes
    if (metafields && Array.isArray(metafields) && metafields.length > 0) {
      const SKIP_TYPES = new Set([
        'metaobject_reference', 'list.metaobject_reference',
        'file_reference', 'list.file_reference',
        'page_reference', 'list.page_reference',
        'product_reference', 'list.product_reference',
        'variant_reference', 'list.variant_reference',
        'collection_reference', 'list.collection_reference',
      ]);
      const JSON_TYPES = new Set([
        'json', 'list.single_line_text_field', 'list.number_integer',
        'list.number_decimal', 'list.url', 'list.date', 'list.date_time',
        'list.color', 'list.volume', 'list.weight', 'list.dimension',
        'money', 'rating', 'volume', 'weight', 'dimension',
      ]);
      const toRichText = (text: string) => {
        const paragraphs = text.split(/\n+/).filter(Boolean);
        return JSON.stringify({
          type: "root",
          children: paragraphs.map(p => ({
            type: "paragraph",
            children: [{ type: "text", value: p }],
          })),
        });
      };

      shopifyProduct.product.metafields = metafields
        .filter((mf: any) => {
          if (!mf.value || String(mf.value).trim() === '') return false;
          const mfType = mf.type || 'single_line_text_field';
          return !SKIP_TYPES.has(mfType);
        })
        .map((mf: any) => {
          const mfType = mf.type || 'single_line_text_field';
          let val = String(mf.value).trim();
          if (mfType === 'rich_text_field') {
            try { JSON.parse(val); } catch { val = toRichText(val); }
          } else if (JSON_TYPES.has(mfType)) {
            try { JSON.parse(val); } catch { val = JSON.stringify(val); }
          }
          return { namespace: mf.namespace, key: mf.key, value: val, type: mfType };
        });

      if (shopifyProduct.product.metafields.length === 0) {
        delete shopifyProduct.product.metafields;
      }
    }

    // Create product on Shopify
    const shopifyRes = await fetch(
      `https://${creds.shop_domain}/admin/api/2024-01/products.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": creds.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(shopifyProduct),
      }
    );

    if (!shopifyRes.ok) {
      const errorData = await shopifyRes.text();
      console.error("Shopify API error:", shopifyRes.status, errorData);
      return new Response(
        JSON.stringify({ error: `Shopify API error: ${shopifyRes.status}`, details: errorData }),
        { status: shopifyRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shopifyData = await shopifyRes.json();
    const product = shopifyData.product;

    // Add to collection if specified
    if (collectionId && product.id) {
      try {
        await fetch(
          `https://${creds.shop_domain}/admin/api/2024-01/collects.json`,
          {
            method: "POST",
            headers: {
              "X-Shopify-Access-Token": creds.access_token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ collect: { product_id: product.id, collection_id: collectionId } }),
          }
        );
      } catch (colErr) {
        console.error("Error adding to collection:", colErr);
      }
    }

    // Create inventory item
    const { data: newInvItem } = await supabase
      .from("inventory_items")
      .insert({ user_id: user.id, name: title })
      .select("id")
      .single();

    const invItemId = newInvItem?.id || null;

    // Store platform_listings for each variant
    for (const variant of product.variants || []) {
      await supabase.from("platform_listings").insert({
        user_id: user.id,
        platform: "shopify",
        platform_listing_id: String(variant.id),
        title: `${product.title}${variant.title !== "Default Title" ? ` - ${variant.title}` : ""}`,
        price: variant.price ? parseFloat(variant.price) : null,
        currency: "USD",
        image_url: product.images?.[0]?.src || null,
        status: product.status === "active" ? "active" : product.status,
        inventory_item_id: invItemId,
        raw_data: { product_id: product.id, variant },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        shopifyProductId: product.id,
        variantCount: product.variants?.length || 0,
        inventoryItemId: invItemId,
        productUrl: `https://${creds.shop_domain}/admin/products/${product.id}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in shopify-create-product-with-variants:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
