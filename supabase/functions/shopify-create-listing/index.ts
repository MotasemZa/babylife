import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { title, description, price, quantity, imageUrls, tags, productType, ebayItemId, inventoryItemId, shopifyCredentialId, status, inventoryTracked, physicalProduct, collectionId, metafields } = await req.json();

    if (!title) {
      return new Response(
        JSON.stringify({ error: 'Title is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const safePrice = price || '0.00';

    // Get Shopify credentials — target specific store if credential ID provided
    let credsQuery = supabase
      .from('user_shopify_credentials')
      .select('shop_domain, access_token, scope')
      .eq('user_id', user.id);

    if (shopifyCredentialId) {
      credsQuery = credsQuery.eq('id', shopifyCredentialId);
    }

    const { data: creds, error: credError } = await credsQuery.limit(1).single();

    if (credError || !creds?.access_token) {
      return new Response(
        JSON.stringify({ error: 'Shopify not connected. Please connect in Connections.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const grantedScopes = (creds.scope || '')
      .split(',')
      .map((scope: string) => scope.trim())
      .filter(Boolean);

    if (!grantedScopes.includes('write_products')) {
      return new Response(
        JSON.stringify({
          error: 'Shopify connection is missing write_products scope. Please reconnect Shopify in Connections and approve product write access.',
          code: 'missing_scope',
          requiredScope: 'write_products',
          grantedScopes,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build Shopify product payload
    const productStatus = status === 'draft' ? 'draft' : (status === 'unlisted' ? 'draft' : 'active');
    const shopifyProduct: any = {
      product: {
        title,
        body_html: description || '',
        product_type: productType || '',
        tags: Array.isArray(tags) ? tags.join(', ') : (tags || ''),
        status: productStatus,
        variants: [{
          price: String(safePrice),
          inventory_quantity: quantity ?? 1,
          inventory_management: inventoryTracked === false ? null : 'shopify',
          requires_shipping: physicalProduct === true,
        }],
      }
    };

    // Add images if provided
    if (imageUrls && imageUrls.length > 0) {
      shopifyProduct.product.images = imageUrls.map((url: string) => ({ src: url }));
    }

    // Add metafields if provided — ensure values are correctly formatted per type
    if (metafields && Array.isArray(metafields) && metafields.length > 0) {
      // Types that require Shopify GIDs we can't produce from AI text
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
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': creds.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(shopifyProduct),
      }
    );

    if (!shopifyRes.ok) {
      const errorData = await shopifyRes.text();
      console.error('Shopify API error:', shopifyRes.status, errorData);

      const missingWriteProducts =
        shopifyRes.status === 403 &&
        (errorData || '').toLowerCase().includes('write_products');

      if (missingWriteProducts) {
        return new Response(
          JSON.stringify({
            error: 'Shopify requires merchant approval for write_products scope. Please reconnect Shopify in Connections and approve product permissions.',
            code: 'missing_scope',
            requiredScope: 'write_products',
            details: errorData,
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Shopify API error: ${shopifyRes.status}`, details: errorData }),
        { status: shopifyRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const shopifyData = await shopifyRes.json();
    const product = shopifyData.product;
    const variant = product.variants?.[0];

    // Create or get inventory item
    let invItemId = inventoryItemId;
    if (!invItemId) {
      // Create a new inventory item as the shared warehouse entry
      const { data: newInvItem, error: invError } = await supabase
        .from('inventory_items')
        .insert({
          user_id: user.id,
          name: title,
          sku: variant?.sku || null,
        })
        .select('id')
        .single();

      if (invError) {
        console.error('Error creating inventory item:', invError);
      } else {
        invItemId = newInvItem.id;
      }
    }

    // Add to collection if specified
    if (collectionId && product.id) {
      try {
        await fetch(
          `https://${creds.shop_domain}/admin/api/2024-01/collects.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': creds.access_token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ collect: { product_id: product.id, collection_id: collectionId } }),
          }
        );
      } catch (colErr) {
        console.error('Error adding to collection:', colErr);
      }
    }

    // Store in platform_listings
    const { error: plError } = await supabase
      .from('platform_listings')
      .insert({
        user_id: user.id,
        platform: 'shopify',
        platform_listing_id: String(variant?.id || product.id),
        title: product.title,
        price: variant?.price ? parseFloat(variant.price) : null,
        currency: 'USD',
        image_url: product.images?.[0]?.src || null,
        status: product.status === 'active' ? 'active' : product.status,
        inventory_item_id: invItemId || null,
        raw_data: { product, variant },
      });

    if (plError) {
      console.error('Error storing platform listing:', plError);
    }

    // If we have an ebayItemId, also try to link eBay listing to same inventory item via platform_listings
    if (ebayItemId && invItemId) {
      // Check if eBay listing already exists in platform_listings
      const { data: existingEbay } = await supabase
        .from('platform_listings')
        .select('id')
        .eq('user_id', user.id)
        .eq('platform', 'ebay')
        .eq('platform_listing_id', ebayItemId)
        .maybeSingle();

      if (!existingEbay) {
        // Get eBay listing data from listings table
        const { data: ebayListing } = await supabase
          .from('listings')
          .select('*')
          .eq('user_id', user.id)
          .eq('ebay_item_id', ebayItemId)
          .single();

        if (ebayListing) {
          await supabase
            .from('platform_listings')
            .insert({
              user_id: user.id,
              platform: 'ebay',
              platform_listing_id: ebayItemId,
              title: ebayListing.title,
              price: ebayListing.price,
              currency: ebayListing.currency || 'EUR',
              image_url: ebayListing.image_url,
              status: ebayListing.status || 'active',
              inventory_item_id: invItemId,
            });
        }
      } else {
        // Update existing eBay platform listing to link to inventory item
        await supabase
          .from('platform_listings')
          .update({ inventory_item_id: invItemId })
          .eq('id', existingEbay.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        shopifyProductId: product.id,
        shopifyVariantId: variant?.id,
        inventoryItemId: invItemId,
        productUrl: `https://${creds.shop_domain}/admin/products/${product.id}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in shopify-create-listing:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
