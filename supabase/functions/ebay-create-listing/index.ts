import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EBAY_TRADING_API = "https://api.ebay.com/ws/api.dll";
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID");
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET");

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getTradingSiteId(country?: string | null): string {
  const c = (country || "US").toUpperCase();
  if (c === "DE") return "77";
  if (c === "GB") return "3";
  if (c === "FR") return "71";
  if (c === "IT") return "101";
  if (c === "ES") return "186";
  if (c === "NL") return "146";
  return "0";
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
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth error:", userError?.message || "No user found");
      return new Response(JSON.stringify({ error: "Invalid user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    console.log(`Creating listing for user: ${userId}`);

    const tokenResult = await getValidAccessToken(supabaseAdmin, userId);
    if (!tokenResult.accessToken) {
      return new Response(JSON.stringify({ error: tokenResult.error }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = tokenResult.accessToken;
    const siteId = getTradingSiteId(tokenResult.country);
    const currency = tokenResult.country === "GB" ? "GBP" : tokenResult.country === "US" ? "USD" : "EUR";

    const body = await req.json();
    const { title, description, price, quantity, imageUrls } = body;

    if (!title || !price || !imageUrls || imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: "Missing required fields: title, price, and at least one image" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build picture URLs XML
    const pictureUrls = imageUrls.map((url: string) => `<PictureURL>${escapeXml(url)}</PictureURL>`).join("\n        ");

    // Generate a unique SKU
    const sku = `OCL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Use AddFixedPriceItem call to create the listing
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${escapeXml(accessToken)}</eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <Title>${escapeXml(title.substring(0, 80))}</Title>
    <Description><![CDATA[${description || title}]]></Description>
    <PrimaryCategory>
      <CategoryID>99</CategoryID>
    </PrimaryCategory>
    <StartPrice currencyID="${currency}">${price}</StartPrice>
    <ConditionID>1000</ConditionID>
    <Country>${tokenResult.country || "US"}</Country>
    <Currency>${currency}</Currency>
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    <PaymentMethods>PayPal</PaymentMethods>
    <PictureDetails>
        ${pictureUrls}
    </PictureDetails>
    <Quantity>${quantity || 1}</Quantity>
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>USPSMedia</ShippingService>
        <ShippingServiceCost currencyID="${currency}">0.00</ShippingServiceCost>
      </ShippingServiceOptions>
    </ShippingDetails>
    <SKU>${escapeXml(sku)}</SKU>
    <Site>${tokenResult.country === "GB" ? "UK" : tokenResult.country === "DE" ? "Germany" : "US"}</Site>
  </Item>
</AddFixedPriceItemRequest>`;

    console.log("Sending AddFixedPriceItem request to eBay...");

    const res = await fetch(EBAY_TRADING_API, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-SITEID": siteId,
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1225",
        "X-EBAY-API-CALL-NAME": "AddFixedPriceItem",
        "X-EBAY-API-IAF-TOKEN": accessToken,
      },
      body: xmlRequest,
    });

    const xmlResponse = await res.text();
    console.log("eBay response:", xmlResponse.substring(0, 1000));

    const ackMatch = xmlResponse.match(/<Ack>(\w+)<\/Ack>/i);
    const ack = ackMatch ? ackMatch[1] : "Unknown";

    if (ack === "Failure") {
      const shortMsg = (xmlResponse.match(/<ShortMessage>([\s\S]*?)<\/ShortMessage>/i) || [])[1];
      const longMsg = (xmlResponse.match(/<LongMessage>([\s\S]*?)<\/LongMessage>/i) || [])[1];
      const message = (longMsg || shortMsg || "Unknown eBay error").trim();
      
      console.error("eBay error:", message);
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract the item ID from successful response
    const itemIdMatch = xmlResponse.match(/<ItemID>(\d+)<\/ItemID>/i);
    const itemId = itemIdMatch ? itemIdMatch[1] : null;

    // Save to local listings table
    if (itemId) {
      await supabaseAdmin
        .from("listings")
        .insert({
          user_id: userId,
          ebay_item_id: itemId,
          title: title.substring(0, 80),
          description: description,
          price: price,
          currency: currency,
          quantity: quantity || 1,
          sku: sku,
          image_url: imageUrls[0],
          status: "active",
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        itemId: itemId,
        sku: sku,
        message: "Listing created successfully on eBay",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in ebay-create-listing:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
