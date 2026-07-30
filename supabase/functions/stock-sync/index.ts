import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID")!;
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET")!;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function refreshEbayToken(refreshToken: string): Promise<string | null> {
  const basicAuth = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
  const resp = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.access_token || null;
}

async function getEbayAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data: creds } = await supabase
    .from("user_ebay_credentials")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!creds) return null;

  const expiresAt = creds.ebay_token_expires_at ? new Date(creds.ebay_token_expires_at) : null;
  if (expiresAt && expiresAt > new Date(Date.now() + 60_000) && creds.ebay_access_token) {
    return creds.ebay_access_token;
  }

  if (!creds.ebay_refresh_token) return null;
  const newToken = await refreshEbayToken(creds.ebay_refresh_token);
  if (newToken) {
    await supabase
      .from("user_ebay_credentials")
      .update({
        ebay_access_token: newToken,
        ebay_token_expires_at: new Date(Date.now() + 7100_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }
  return newToken;
}

async function updateEbayQuantity(
  accessToken: string,
  itemId: string,
  newQuantity: number,
  siteId = "77"
): Promise<{ ok: boolean; error?: string }> {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${escapeXml(accessToken)}</eBayAuthToken></RequesterCredentials>
  <Item>
    <ItemID>${escapeXml(itemId)}</ItemID>
    <Quantity>${Math.max(0, newQuantity)}</Quantity>
  </Item>
</ReviseFixedPriceItemRequest>`;

  const resp = await fetch("https://api.ebay.com/ws/api.dll", {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1349",
      "X-EBAY-API-CALL-NAME": "ReviseFixedPriceItem",
      "X-EBAY-API-SITEID": siteId,
    },
    body: xml,
  });

  const text = await resp.text();
  const ack = text.match(/<Ack>(.*?)<\/Ack>/)?.[1];
  if (ack === "Success" || ack === "Warning") return { ok: true };
  const errMsg = text.match(/<ShortMessage>(.*?)<\/ShortMessage>/)?.[1] || "Unknown eBay error";
  return { ok: false, error: errMsg };
}

async function adjustShopifyInventory(
  shopDomain: string,
  accessToken: string,
  shopifyInventoryItemId: number | string,
  adjustment: number
): Promise<{ ok: boolean; error?: string }> {
  // Get first location
  const locResp = await fetch(`https://${shopDomain}/admin/api/2024-01/locations.json`, {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  if (!locResp.ok) return { ok: false, error: "Failed to fetch Shopify locations" };
  const locData = await locResp.json();
  const locationId = locData.locations?.[0]?.id;
  if (!locationId) return { ok: false, error: "No Shopify location found" };

  const adjResp = await fetch(`https://${shopDomain}/admin/api/2024-01/inventory_levels/adjust.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      location_id: locationId,
      inventory_item_id: Number(shopifyInventoryItemId),
      available_adjustment: adjustment,
    }),
  });

  if (!adjResp.ok) {
    const errText = await adjResp.text();
    return { ok: false, error: `Shopify inventory adjust failed: ${errText.slice(0, 200)}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, inventoryItemId, soldQuantity, sourcePlatform } = await req.json();

    if (!userId || !inventoryItemId || !soldQuantity || !sourcePlatform) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find all OTHER platform_listings linked to this inventory item
    const { data: targetListings, error: tlError } = await supabase
      .from("platform_listings")
      .select("*")
      .eq("inventory_item_id", inventoryItemId)
      .eq("user_id", userId)
      .neq("platform", sourcePlatform);

    if (tlError) throw tlError;
    if (!targetListings || targetListings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No linked listings on other platforms" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ platform: string; listingId: string; ok: boolean; error?: string }> = [];

    for (const listing of targetListings) {
      if (listing.platform === "ebay") {
        const ebayItemId = listing.platform_listing_id;
        const accessToken = await getEbayAccessToken(supabase, userId);
        if (!accessToken) {
          results.push({ platform: "ebay", listingId: ebayItemId, ok: false, error: "No eBay credentials" });
          continue;
        }

        // Get current quantity from listings table
        const { data: ebayListing } = await supabase
          .from("listings")
          .select("quantity")
          .eq("user_id", userId)
          .eq("ebay_item_id", ebayItemId)
          .single();

        const currentQty = ebayListing?.quantity ?? 0;
        const newQty = Math.max(0, currentQty - soldQuantity);

        const result = await updateEbayQuantity(accessToken, ebayItemId, newQty);
        results.push({ platform: "ebay", listingId: ebayItemId, ...result });

        // Update local listings table too
        if (result.ok) {
          await supabase
            .from("listings")
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("ebay_item_id", ebayItemId);
        }
      } else if (listing.platform === "shopify") {
        // Get Shopify credentials
        const { data: shopifyCreds } = await supabase
          .from("user_shopify_credentials")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (!shopifyCreds?.access_token) {
          results.push({ platform: "shopify", listingId: listing.platform_listing_id, ok: false, error: "No Shopify credentials" });
          continue;
        }

        // Extract Shopify inventory_item_id from raw_data
        const shopifyInvItemId =
          listing.raw_data?.variant?.inventory_item_id ||
          listing.raw_data?.inventory_item_id;

        if (!shopifyInvItemId) {
          results.push({ platform: "shopify", listingId: listing.platform_listing_id, ok: false, error: "No Shopify inventory_item_id in raw_data" });
          continue;
        }

        const result = await adjustShopifyInventory(
          shopifyCreds.shop_domain,
          shopifyCreds.access_token,
          shopifyInvItemId,
          -soldQuantity
        );
        results.push({ platform: "shopify", listingId: listing.platform_listing_id, ...result });
      }
    }

    console.log(`Stock sync for inventory ${inventoryItemId}: ${JSON.stringify(results)}`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Stock sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
