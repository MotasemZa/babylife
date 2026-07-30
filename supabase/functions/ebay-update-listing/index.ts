import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EBAY_API_BASE = "https://api.ebay.com";
const EBAY_TRADING_API = "https://api.ebay.com/ws/api.dll";

const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID");
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET");

type EbayLocale = {
  acceptLanguage: string;
  contentLanguage: string;
};

function getEbayLocale(country?: string | null): EbayLocale {
  const c = (country || "US").toUpperCase();

  // Keep values strictly BCP-47 (e.g. de-DE) to avoid eBay header validation errors.
  switch (c) {
    case "DE":
      return { acceptLanguage: "de-DE", contentLanguage: "de-DE" };
    case "AT":
      return { acceptLanguage: "de-AT", contentLanguage: "de-AT" };
    case "CH":
      return { acceptLanguage: "de-CH", contentLanguage: "de-CH" };
    case "FR":
      return { acceptLanguage: "fr-FR", contentLanguage: "fr-FR" };
    case "ES":
      return { acceptLanguage: "es-ES", contentLanguage: "es-ES" };
    case "IT":
      return { acceptLanguage: "it-IT", contentLanguage: "it-IT" };
    case "NL":
      return { acceptLanguage: "nl-NL", contentLanguage: "nl-NL" };
    case "GB":
      return { acceptLanguage: "en-GB", contentLanguage: "en-GB" };
    case "US":
    default:
      return { acceptLanguage: "en-US", contentLanguage: "en-US" };
  }
}

function getTradingSiteId(country?: string | null): string {
  const c = (country || "US").toUpperCase();
  // Only add what we actually need right now; default to US (0).
  if (c === "DE") return "77";
  if (c === "GB") return "3";
  if (c === "FR") return "71";
  if (c === "IT") return "101";
  if (c === "ES") return "186";
  if (c === "NL") return "146";
  return "0";
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string } | null> {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    console.error("Missing eBay credentials");
    return null;
  }

  const credentials = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);

  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Token refresh failed:", response.status, errorText);
    return null;
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  return {
    accessToken: data.access_token,
    expiresAt,
  };
}

async function getValidAccessToken(
  supabaseAdmin: any,
  userId: string,
): Promise<{ accessToken: string; country: string | null; error?: string } | { accessToken: null; error: string }> {
  // Get credentials from secure table
  const { data: credentials, error: credError } = await supabaseAdmin
    .from("user_ebay_credentials")
    .select("ebay_access_token, ebay_refresh_token, ebay_token_expires_at")
    .eq("user_id", userId)
    .single();

  // Get country from user_settings
  const { data: settings } = await supabaseAdmin
    .from("user_settings")
    .select("country")
    .eq("user_id", userId)
    .single();

  const country = settings?.country || null;

  if (credError || !credentials) {
    return { accessToken: null, error: "eBay account not connected. Please connect your eBay account first." };
  }

  const { ebay_access_token, ebay_refresh_token, ebay_token_expires_at } = credentials;

  if (!ebay_refresh_token) {
    return { accessToken: null, error: "eBay account not connected. Please connect your eBay account first." };
  }

  const expiresAt = new Date(ebay_token_expires_at || 0);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (ebay_access_token && expiresAt.getTime() - bufferMs > now.getTime()) {
    return { accessToken: ebay_access_token, country };
  }

  console.log("Refreshing eBay access token...");
  const refreshed = await refreshAccessToken(ebay_refresh_token);

  if (!refreshed) {
    return { accessToken: null, error: "Failed to refresh eBay token. Please reconnect your eBay account." };
  }

  // Update tokens in secure credentials table
  await supabaseAdmin
    .from("user_ebay_credentials")
    .update({
      ebay_access_token: refreshed.accessToken,
      ebay_token_expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { accessToken: refreshed.accessToken, country };
}

type UpdatePayload = {
  sku?: string;
  itemId?: string;
  title?: string;
  description?: string;
  price?: number;
  quantity?: number;
  currency?: string;
};

async function updateViaTradingApi(opts: {
  accessToken: string;
  siteId: string;
  itemId: string;
  sku?: string;
  title?: string;
  description?: string;
  price?: number;
  quantity?: number;
  currency?: string;
}) {
  const { accessToken, siteId, itemId, sku, title, description, price, quantity, currency } = opts;

  const itemFields: string[] = [];
  itemFields.push(`<ItemID>${escapeXml(itemId)}</ItemID>`);
  if (sku) itemFields.push(`<SKU>${escapeXml(sku)}</SKU>`);
  if (title !== undefined) itemFields.push(`<Title>${escapeXml(title)}</Title>`);
  if (description !== undefined) itemFields.push(`<Description>${escapeXml(description)}</Description>`);
  if (price !== undefined) {
    const cur = escapeXml(currency || "EUR");
    itemFields.push(`<StartPrice currencyID=\"${cur}\">${escapeXml(String(price))}</StartPrice>`);
  }
  if (quantity !== undefined) itemFields.push(`<Quantity>${escapeXml(String(quantity))}</Quantity>`);

  const xmlRequest = `<?xml version=\"1.0\" encoding=\"utf-8\"?>
<ReviseFixedPriceItemRequest xmlns=\"urn:ebay:apis:eBLBaseComponents\">
  <RequesterCredentials>
    <eBayAuthToken>${escapeXml(accessToken)}</eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>de_DE</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    ${itemFields.join("\n    ")}
  </Item>
</ReviseFixedPriceItemRequest>`;

  const res = await fetch(EBAY_TRADING_API, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-SITEID": siteId,
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1225",
      "X-EBAY-API-CALL-NAME": "ReviseFixedPriceItem",
      "X-EBAY-API-IAF-TOKEN": accessToken,
    },
    body: xmlRequest,
  });

  const xmlResponse = await res.text();
  const ackMatch = xmlResponse.match(/<Ack>(\w+)<\/Ack>/i);
  const ack = ackMatch ? ackMatch[1] : "Unknown";

  if (!res.ok || ack === "Failure") {
    const shortMsg = (xmlResponse.match(/<ShortMessage>([\s\S]*?)<\/ShortMessage>/i) || [])[1];
    const longMsg = (xmlResponse.match(/<LongMessage>([\s\S]*?)<\/LongMessage>/i) || [])[1];
    const message = (longMsg || shortMsg || `Trading API error (${res.status})`).trim();
    return { ok: false as const, error: message, raw: xmlResponse.substring(0, 1000) };
  }

  return { ok: true as const };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");

    // Verify the JWT and get user using the admin client
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth error:", userError?.message || "No user found");
      return new Response(JSON.stringify({ error: "Invalid user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    console.log(`Authenticated user: ${userId}`);

    const tokenResult = await getValidAccessToken(supabaseAdmin, userId);
    if (!tokenResult.accessToken) {
      return new Response(JSON.stringify({ error: tokenResult.error }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = tokenResult.accessToken;
    const locale = getEbayLocale(tokenResult.country);
    const siteId = getTradingSiteId(tokenResult.country);
    console.log(`Using eBay locale ${locale.acceptLanguage} (country=${tokenResult.country || "unknown"}, siteId=${siteId})`);

    const body = await req.json();
    const updates = body?.updates as UpdatePayload[] | undefined;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return new Response(JSON.stringify({ error: "No updates provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${updates.length} listing updates for user ${userId}`);

    const results: { sku: string; success: boolean; error?: string; details?: string }[] = [];

    for (const update of updates) {
      const sku = (update.sku || "").trim();
      const itemId = (update.itemId || "").trim();
      const title = update.title;
      const description = update.description;
      const price = update.price;
      const quantity = update.quantity;
      const currency = update.currency;

      const label = sku || itemId || "unknown";

      if (!sku && !itemId) {
        results.push({ sku: label, success: false, error: "Missing SKU and ItemID" });
        continue;
      }

      try {
        const wantsInventory = title !== undefined || description !== undefined;
        const wantsOffer = price !== undefined || quantity !== undefined;

        // If the saved "sku" is actually a legacy ItemID (common when the seller doesn't use SKU),
        // use Trading API to revise the listing instead.
        const isSkuActuallyItemId = !!sku && !!itemId && sku === itemId;
        const canUseInventoryApi = !!sku && !isSkuActuallyItemId;

        let inventoryUpdated = false;
        let offerUpdated = false;
        let tradingUpdated = false;
        const errors: string[] = [];

        // --- Inventory API path (SKU-based) ---
        if (canUseInventoryApi) {
          if (wantsInventory) {
            console.log(`Updating inventory item for SKU: ${sku}`);

            const getUrl = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
            const getRes = await fetch(getUrl, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                Accept: "application/json",
                "Accept-Language": locale.acceptLanguage,
              },
            });

            if (!getRes.ok) {
              const errorText = await getRes.text();
              console.error(`Failed to get inventory item ${sku}:`, getRes.status, errorText);
              errors.push(`Failed to fetch inventory item: ${getRes.status}`);
            } else {
              const currentItem = await getRes.json();

              const updatedItem = {
                ...currentItem,
                product: {
                  ...currentItem.product,
                  ...(title !== undefined && { title }),
                  ...(description !== undefined && { description }),
                },
              };

              const updateUrl = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
              const updateRes = await fetch(updateUrl, {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  "Accept-Language": locale.acceptLanguage,
                  "Content-Language": locale.contentLanguage,
                },
                body: JSON.stringify(updatedItem),
              });

              if (!updateRes.ok) {
                const errorText = await updateRes.text();
                console.error(`Failed to update inventory item ${sku}:`, updateRes.status, errorText);
                let errorMessage = `Inventory update failed: ${updateRes.status}`;
                try {
                  const errorJson = JSON.parse(errorText);
                  errorMessage = errorJson.errors?.[0]?.message || errorMessage;
                } catch {}
                errors.push(errorMessage);
              } else {
                inventoryUpdated = true;
              }
            }
          }

          if (wantsOffer) {
            console.log(`Looking for offers for SKU: ${sku}`);

            const offersUrl = `${EBAY_API_BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`;
            const offersRes = await fetch(offersUrl, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
                "Accept-Language": locale.acceptLanguage,
              },
            });

            if (!offersRes.ok) {
              const errorText = await offersRes.text();
              console.error(`Failed to get offers for ${sku}:`, offersRes.status, errorText);
              errors.push(`Failed to fetch offers: ${offersRes.status}`);
            } else {
              const offersData = await offersRes.json();
              const offers = offersData.offers || [];

              if (offers.length === 0) {
                errors.push("No active offers found for this SKU");
              } else {
                const offer = offers[0];
                const offerId = offer.offerId;

                const updatedOffer = {
                  ...offer,
                  ...(price !== undefined && {
                    pricingSummary: {
                      ...offer.pricingSummary,
                      price: {
                        value: price.toString(),
                        currency: currency || offer.pricingSummary?.price?.currency || "EUR",
                      },
                    },
                  }),
                  ...(quantity !== undefined && { availableQuantity: quantity }),
                };

                // Remove read-only fields
                delete updatedOffer.offerId;
                delete updatedOffer.sku;
                delete updatedOffer.status;
                delete updatedOffer.listing;

                const updateOfferUrl = `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}`;
                const updateOfferRes = await fetch(updateOfferUrl, {
                  method: "PUT",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "Accept-Language": locale.acceptLanguage,
                    "Content-Language": locale.contentLanguage,
                  },
                  body: JSON.stringify(updatedOffer),
                });

                if (!updateOfferRes.ok) {
                  const errorText = await updateOfferRes.text();
                  console.error(`Failed to update offer ${offerId}:`, updateOfferRes.status, errorText);
                  let errorMessage = `Offer update failed: ${updateOfferRes.status}`;
                  try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.errors?.[0]?.message || errorMessage;
                  } catch {}
                  errors.push(errorMessage);
                } else {
                  offerUpdated = true;
                }
              }
            }
          }
        }

        // --- Trading API fallback (ItemID-based) ---
        // Use Trading API when:
        // - SKU is missing OR
        // - stored SKU equals ItemID OR
        // - offer update failed with "Offer not available" / not found
        const shouldFallbackToTrading =
          !!itemId &&
          (!canUseInventoryApi || (wantsOffer && !offerUpdated) || (wantsInventory && !inventoryUpdated));

        if (shouldFallbackToTrading && (wantsInventory || wantsOffer)) {
          console.log(`Falling back to Trading API revise for itemId=${itemId}`);
          const trading = await updateViaTradingApi({
            accessToken,
            siteId,
            itemId,
            sku: sku && !isSkuActuallyItemId ? sku : undefined,
            title,
            description,
            price,
            quantity,
            currency: currency || "EUR",
          });

          if (!trading.ok) {
            errors.push(`Trading revise failed: ${trading.error}`);
          } else {
            tradingUpdated = true;
          }
        }

        const success =
          (!wantsInventory || inventoryUpdated || tradingUpdated) &&
          (!wantsOffer || offerUpdated || tradingUpdated);

        results.push({
          sku: label,
          success,
          error: errors.length ? errors.join("; ") : undefined,
          details: `Inventory: ${inventoryUpdated ? "updated" : wantsInventory ? "skipped/failed" : "skipped"}, Offer: ${offerUpdated ? "updated" : wantsOffer ? "skipped/failed" : "skipped"}, Trading: ${tradingUpdated ? "updated" : shouldFallbackToTrading ? "failed" : "skipped"}`,
        });
      } catch (e) {
        console.error(`Error updating ${label}:`, e);
        results.push({ sku: label, success: false, error: e instanceof Error ? e.message : "Unknown error" });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(`Update complete: ${successCount} succeeded, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        results,
        summary: {
          total: results.length,
          success: successCount,
          failed: failCount,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in ebay-update-listing:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
