import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID");
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET");

// Trading API endpoint for production
const EBAY_TRADING_API = "https://api.ebay.com/ws/api.dll";

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
): Promise<{ accessToken: string; error?: string } | { accessToken: null; error: string }> {
  // Read from secure credentials table
  const { data: credentials, error: credError } = await supabaseAdmin
    .from("user_ebay_credentials")
    .select("ebay_access_token, ebay_refresh_token, ebay_token_expires_at")
    .eq("user_id", userId)
    .single();

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
    return { accessToken: ebay_access_token };
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

  return { accessToken: refreshed.accessToken };
}

// Parse XML response to JSON-like structure
function parseXMLValue(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : "";
}

function parseXMLArray(xml: string, containerTag: string, itemTag: string): string[] {
  const containerRegex = new RegExp(`<${containerTag}[^>]*>([\\s\\S]*?)</${containerTag}>`, 'gi');
  const items: string[] = [];
  let containerMatch;
  
  while ((containerMatch = containerRegex.exec(xml)) !== null) {
    items.push(containerMatch[1]);
  }
  
  if (items.length === 0) {
    const itemRegex = new RegExp(`<${itemTag}[^>]*>([\\s\\S]*?)</${itemTag}>`, 'gi');
    let itemMatch;
    while ((itemMatch = itemRegex.exec(xml)) !== null) {
      items.push(itemMatch[0]);
    }
  }
  
  return items;
}

function extractItemsFromXML(xml: string): any[] {
  const items: any[] = [];
  
  // Find all Item elements within ActiveList
  const activeListMatch = xml.match(/<ActiveList>([\s\S]*?)<\/ActiveList>/i);
  if (!activeListMatch) {
    console.log("No ActiveList found in response");
    return items;
  }
  
  const activeListContent = activeListMatch[1];
  const itemRegex = /<Item>([\s\S]*?)<\/Item>/gi;
  let itemMatch;
  
  while ((itemMatch = itemRegex.exec(activeListContent)) !== null) {
    const itemXml = itemMatch[1];
    
    // Extract description (may contain CDATA)
    let description = "";
    const cdataDescMatch = itemXml.match(/<Description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/Description>/i);
    if (cdataDescMatch) {
      description = cdataDescMatch[1];
    } else {
      description = parseXMLValue(itemXml, "Description");
    }

    // Extract category name
    const categoryMatch = itemXml.match(/<PrimaryCategory[^>]*>[\s\S]*?<CategoryName>([^<]*)<\/CategoryName>[\s\S]*?<\/PrimaryCategory>/i);
    const categoryName = categoryMatch ? categoryMatch[1] : "";

    const item = {
      itemId: parseXMLValue(itemXml, "ItemID"),
      title: parseXMLValue(itemXml, "Title"),
      sku: parseXMLValue(itemXml, "SKU") || "",
      quantity: parseInt(parseXMLValue(itemXml, "Quantity") || "0"),
      quantityAvailable: parseInt(parseXMLValue(itemXml, "QuantityAvailable") || "0"),
      currentPrice: parseXMLValue(itemXml, "CurrentPrice"),
      currency: "",
      startTime: parseXMLValue(itemXml, "StartTime"),
      listingType: parseXMLValue(itemXml, "ListingType"),
      viewItemURL: parseXMLValue(itemXml, "ViewItemURL"),
      pictureURL: parseXMLValue(itemXml, "GalleryURL") || parseXMLValue(itemXml, "PictureURL"),
      watchCount: parseInt(parseXMLValue(itemXml, "WatchCount") || "0"),
      description,
      conditionDisplayName: parseXMLValue(itemXml, "ConditionDisplayName"),
      categoryName,
    };
    
    // Extract currency from CurrentPrice attribute
    const priceMatch = itemXml.match(/<CurrentPrice[^>]*currencyID="([^"]+)"[^>]*>([^<]*)<\/CurrentPrice>/i);
    if (priceMatch) {
      item.currency = priceMatch[1];
      item.currentPrice = priceMatch[2];
    }
    
    items.push(item);
  }
  
  return items;
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
    console.log(`Authenticated user: ${userId}`);

    const tokenResult = await getValidAccessToken(supabaseAdmin, userId);
    if (!tokenResult.accessToken) {
      return new Response(JSON.stringify({ error: tokenResult.error }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = tokenResult.accessToken;

    const body = await req.json().catch(() => ({}));
    const pageNumber = body.pageNumber || 1;
    const entriesPerPage = Math.min(body.limit || 100, 200);

    console.log(`Fetching eBay active listings for user ${userId}, page: ${pageNumber}, entriesPerPage: ${entriesPerPage}`);

    // Use Trading API GetMyeBaySelling to get ALL active listings
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
      <PageNumber>${pageNumber}</PageNumber>
    </Pagination>
    <Sort>TimeLeft</Sort>
  </ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>
  <OutputSelector>ItemID</OutputSelector>
  <OutputSelector>Title</OutputSelector>
  <OutputSelector>SKU</OutputSelector>
  <OutputSelector>Quantity</OutputSelector>
  <OutputSelector>QuantityAvailable</OutputSelector>
  <OutputSelector>CurrentPrice</OutputSelector>
  <OutputSelector>StartTime</OutputSelector>
  <OutputSelector>ListingType</OutputSelector>
  <OutputSelector>ViewItemURL</OutputSelector>
  <OutputSelector>GalleryURL</OutputSelector>
  <OutputSelector>PictureURL</OutputSelector>
  <OutputSelector>WatchCount</OutputSelector>
  <OutputSelector>PaginationResult</OutputSelector>
  
  <OutputSelector>ConditionDisplayName</OutputSelector>
  <OutputSelector>PrimaryCategory</OutputSelector>
</GetMyeBaySellingRequest>`;

    const tradingRes = await fetch(EBAY_TRADING_API, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-SITEID": "77", // 77 = Germany (EBAY_DE)
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1225",
        "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
        "X-EBAY-API-IAF-TOKEN": accessToken,
      },
      body: xmlRequest,
    });

    const xmlResponse = await tradingRes.text();
    console.log("Trading API response status:", tradingRes.status);
    console.log("Response preview:", xmlResponse.substring(0, 500));

    // Check for errors in response
    const ackMatch = xmlResponse.match(/<Ack>(\w+)<\/Ack>/i);
    const ack = ackMatch ? ackMatch[1] : "Unknown";

    if (ack === "Failure") {
      const errorMsg = parseXMLValue(xmlResponse, "ShortMessage") || parseXMLValue(xmlResponse, "LongMessage") || "Unknown error";
      const errorCode = parseXMLValue(xmlResponse, "ErrorCode");
      console.error("Trading API error:", errorCode, errorMsg);
      
      if (errorCode === "931" || errorCode === "932") {
        return new Response(JSON.stringify({ error: "eBay session expired. Please reconnect your account." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: `eBay API error: ${errorMsg}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the items from XML
    const items = extractItemsFromXML(xmlResponse);
    console.log(`Parsed ${items.length} active listings`);

    // Get pagination info
    const totalEntries = parseInt(parseXMLValue(xmlResponse, "TotalNumberOfEntries") || "0");
    const totalPages = parseInt(parseXMLValue(xmlResponse, "TotalNumberOfPages") || "1");

    // Map to our listing format
    const listings = items.map((item: any) => ({
      sku: item.sku || item.itemId,
      itemId: item.itemId,
      title: item.title || "Untitled",
      description: item.description || "",
      price: item.currentPrice ? `${item.currentPrice}` : "",
      currency: item.currency || "",
      category: item.categoryName || "",
      condition: item.conditionDisplayName || "",
      quantity: typeof item.quantityAvailable === 'number' ? item.quantityAvailable : (item.quantity ?? 0),
      imageUrls: item.pictureURL ? [item.pictureURL] : [],
      listingType: item.listingType,
      viewItemURL: item.viewItemURL,
      watchCount: item.watchCount,
      startTime: item.startTime,
      raw: item,
    }));

    const hasMore = pageNumber < totalPages;

    console.log(`Returning ${listings.length} listings (page ${pageNumber}/${totalPages}, total: ${totalEntries})`);

    return new Response(
      JSON.stringify({
        listings,
        total: totalEntries,
        pageNumber,
        totalPages,
        hasMore,
        nextPageNumber: hasMore ? pageNumber + 1 : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in ebay-fetch-listings:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
