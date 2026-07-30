import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// eBay API endpoints
const EBAY_API_BASE = "https://api.ebay.com";
const EBAY_APIZ_BASE = "https://apiz.ebay.com";
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID")!;
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET")!;

const LIMIT = 200;
const MAX_PAGES_PER_USER = 5; // Limit pages per user to prevent timeouts

// Helper to encode Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to decode PEM private key and sign with Ed25519
async function signWithEd25519(privateKeyPem: string, data: Uint8Array): Promise<string> {
  const pemLines = privateKeyPem.split("\n");
  const base64Key = pemLines.filter((line) => !line.startsWith("-----")).join("");
  const derBytes = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    derBytes.buffer as ArrayBuffer,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const signature = await crypto.subtle.sign("Ed25519", cryptoKey, dataBuffer);
  return uint8ArrayToBase64(new Uint8Array(signature));
}

// Create Content-Digest header (SHA-256 hash of body)
async function createContentDigest(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(body);
  const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const base64Hash = uint8ArrayToBase64(new Uint8Array(hashBuffer));
  return `sha-256=:${base64Hash}:`;
}

// Create signature headers per RFC9421 for eBay Digital Signatures
async function createSignatureHeaders(
  method: string,
  url: URL,
  jwe: string,
  privateKeyPem: string,
  body?: string,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const timestamp = Math.floor(Date.now() / 1000);
  headers["x-ebay-signature-key"] = jwe;

  let contentDigest = "";
  if (body) {
    contentDigest = await createContentDigest(body);
    headers["Content-Digest"] = contentDigest;
  }

  const authority = url.host;
  const path = url.pathname;
  const methodValue = method.toUpperCase();

  let signatureBase = "";
  let coveredComponents = "";

  if (body) {
    signatureBase = `"content-digest": ${contentDigest}\n`;
    signatureBase += `"x-ebay-signature-key": ${jwe}\n`;
    signatureBase += `"@method": ${methodValue}\n`;
    signatureBase += `"@path": ${path}\n`;
    signatureBase += `"@authority": ${authority}\n`;
    signatureBase += `"@signature-params": ("content-digest" "x-ebay-signature-key" "@method" "@path" "@authority");created=${timestamp}`;
    coveredComponents = `("content-digest" "x-ebay-signature-key" "@method" "@path" "@authority");created=${timestamp}`;
  } else {
    signatureBase = `"x-ebay-signature-key": ${jwe}\n`;
    signatureBase += `"@method": ${methodValue}\n`;
    signatureBase += `"@path": ${path}\n`;
    signatureBase += `"@authority": ${authority}\n`;
    signatureBase += `"@signature-params": ("x-ebay-signature-key" "@method" "@path" "@authority");created=${timestamp}`;
    coveredComponents = `("x-ebay-signature-key" "@method" "@path" "@authority");created=${timestamp}`;
  }

  const encoder = new TextEncoder();
  const signatureBaseBytes = encoder.encode(signatureBase);
  const signature = await signWithEd25519(privateKeyPem, signatureBaseBytes);

  headers["Signature"] = `sig1=:${signature}:`;
  headers["Signature-Input"] = `sig1=${coveredComponents}`;

  return headers;
}

async function makeSignedRequest(
  url: string,
  accessToken: string,
  signingKeyJwe: string | null,
  signingPrivateKey: string | null,
  method: string = "GET",
  body?: string,
): Promise<Response> {
  const urlObj = new URL(url);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (signingKeyJwe && signingPrivateKey) {
    headers["x-ebay-enforce-signature"] = "true";
    try {
      const signatureHeaders = await createSignatureHeaders(method, urlObj, signingKeyJwe, signingPrivateKey, body);
      Object.assign(headers, signatureHeaders);
    } catch (signError) {
      console.error("Failed to sign request:", signError);
    }
  }

  return fetch(url, { method, headers, body: body || undefined });
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const credentials = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
  
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    console.error("Failed to refresh token:", await res.text());
    return null;
  }

  const data = await res.json();
  return data.access_token || null;
}

async function syncUserData(
  supabaseAdmin: any,
  userId: string,
  accessToken: string,
  signingKeyJwe: string | null,
  signingPrivateKey: string | null,
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  // Get the last sync date - we only want to sync new data since last sync
  const { data: lastImport } = await supabaseAdmin
    .from("import_history")
    .select("completed_at")
    .eq("user_id", userId)
    .eq("type", "ebay-sync")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();

  // Default to last 24 hours if no previous sync, to catch any missed data
  const startDate = lastImport?.completed_at
    ? new Date(new Date(lastImport.completed_at).getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  
  const endDate = new Date().toISOString().split("T")[0];

  console.log(`Syncing user ${userId} from ${startDate} to ${endDate}`);

  // Sync Orders
  try {
    let offset = 0;
    for (let page = 0; page < MAX_PAGES_PER_USER; page++) {
      const ordersUrl = new URL(`${EBAY_API_BASE}/sell/fulfillment/v1/order`);
      ordersUrl.searchParams.set("filter", `creationdate:[${startDate}T00:00:00.000Z..${endDate}T23:59:59.999Z]`);
      ordersUrl.searchParams.set("limit", String(LIMIT));
      ordersUrl.searchParams.set("offset", String(offset));

      const res = await fetch(ordersUrl.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        errors.push(`Orders API error: ${res.status}`);
        console.error("Orders API error:", text);
        break;
      }

      const data = await res.json();
      const orders: any[] = data.orders || [];

      if (orders.length > 0) {
        const txns = orders.map((order) => {
          const lineItems = order.lineItems || [];
          const firstItem = lineItems[0] || {};
          const pricingSummary = order.pricingSummary || {};
          const totalObj = pricingSummary.total || {};
          const deliveryCost = pricingSummary.deliveryCost || {};
          
          // Extract buyer country from shipping address (most accurate for tax purposes)
          const fulfillmentInstructions = order.fulfillmentStartInstructions || [];
          const shippingStep = fulfillmentInstructions[0]?.shippingStep || {};
          const shipTo = shippingStep.shipTo || {};
          const shipToAddress = shipTo.contactAddress || {};
          
          // Fallback to buyer registration address if no shipping address
          const buyer = order.buyer || {};
          const buyerAddress = buyer.buyerRegistrationAddress || {};
          const buyerContactAddress = buyerAddress.contactAddress || {};
          
          // Priority: shipping address > buyer contact address > buyer registration country
          const buyerCountry = shipToAddress.countryCode 
            || buyerContactAddress.countryCode 
            || buyerAddress.countryCode 
            || "US";

          const gross = parseFloat(totalObj.value || "0");
          const fees = parseFloat((order.totalFeeBasisAmount?.value) || "0") * 0.12;
          const shippingCost = parseFloat(deliveryCost.value || "0");

          const ebayCollectedTax = lineItems.reduce((sum: number, item: any) => {
            const taxes = item?.ebayCollectAndRemitTaxes || [];
            return sum + taxes.reduce((s: number, t: any) => s + parseFloat(t?.amount?.value || "0"), 0);
          }, 0);

          return {
            user_id: userId,
            external_id: String(order.orderId || ""),
            date: order.creationDate,
            type: "sale",
            order_id: String(order.orderId || ""),
            item_title: firstItem.title || "Unknown Item",
            sku: firstItem.sku || null,
            quantity: lineItems.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0),
            gross,
            fees,
            shipping_charged: shippingCost,
            shipping_cost: shippingCost * 0.8,
            tax_collected: ebayCollectedTax,
            refunds: 0,
            net: gross - fees - shippingCost * 0.8,
            currency: totalObj.currency || "USD",
            buyer_country: buyerCountry,
            category: "Uncategorized",
            status: "unmatched",
            raw_data: order,
          };
        });

        const { error: upsertError } = await supabaseAdmin.from("transactions").upsert(txns, {
          onConflict: "user_id,external_id",
          ignoreDuplicates: true,
        });

        if (upsertError) {
          errors.push(`Orders upsert error: ${upsertError.message}`);
        } else {
          imported += txns.length;
        }
      }

      if (orders.length < LIMIT) break;
      offset += LIMIT;
    }
  } catch (err) {
    errors.push(`Orders sync failed: ${err instanceof Error ? err.message : "Unknown error"}`);
  }

  // Sync Finances (for tax updates)
  if (signingKeyJwe && signingPrivateKey) {
    try {
      let offset = 0;
      for (let page = 0; page < MAX_PAGES_PER_USER; page++) {
        const financeUrl = new URL(`${EBAY_APIZ_BASE}/sell/finances/v1/transaction`);
        financeUrl.searchParams.set("filter", `transactionDate:[${startDate}T00:00:00.000Z..${endDate}T23:59:59.999Z]`);
        financeUrl.searchParams.set("limit", String(LIMIT));
        financeUrl.searchParams.set("offset", String(offset));

        const res = await makeSignedRequest(financeUrl.toString(), accessToken, signingKeyJwe, signingPrivateKey);

        if (!res.ok) break;

        const data = await res.json();
        const txns: any[] = data.transactions || [];

        // Update tax_collected for SALE transactions
        for (const txn of txns) {
          if (txn.transactionType === "SALE" && txn.orderId && txn.eBayCollectedTaxAmount?.value) {
            const taxValue = parseFloat(txn.eBayCollectedTaxAmount.value);
            if (taxValue > 0) {
              await supabaseAdmin
                .from("transactions")
                .update({ tax_collected: taxValue })
                .eq("user_id", userId)
                .eq("order_id", String(txn.orderId))
                .eq("type", "sale");
            }
          }
        }

        if (txns.length < LIMIT) break;
        offset += LIMIT;
      }
    } catch (err) {
      console.error("Finances sync error:", err);
    }
  }

  // Sync Payouts
  try {
    let offset = 0;
    for (let page = 0; page < MAX_PAGES_PER_USER; page++) {
      const payoutsUrl = new URL(`${EBAY_APIZ_BASE}/sell/finances/v1/payout`);
      payoutsUrl.searchParams.set("filter", `payoutDate:[${startDate}T00:00:00.000Z..${endDate}T23:59:59.999Z]`);
      payoutsUrl.searchParams.set("limit", String(LIMIT));
      payoutsUrl.searchParams.set("offset", String(offset));

      const res = await makeSignedRequest(payoutsUrl.toString(), accessToken, signingKeyJwe, signingPrivateKey);

      if (!res.ok) break;

      const data = await res.json();
      const payouts: any[] = data.payouts || [];

      if (payouts.length > 0) {
        const mapped = payouts.map((p) => ({
          user_id: userId,
          external_id: String(p.payoutId || ""),
          payout_id: String(p.payoutId || ""),
          payout_date: p.payoutDate,
          gross: parseFloat(p.amount?.value || "0"),
          fees: 0,
          net: parseFloat(p.amount?.value || "0"),
          status: p.payoutStatus || "pending",
          transaction_count: p.transactionCount || 0,
          raw_data: p,
        }));

        const { error: upsertError } = await supabaseAdmin.from("payouts").upsert(mapped, {
          onConflict: "user_id,external_id",
          ignoreDuplicates: true,
        });

        if (upsertError) {
          errors.push(`Payouts upsert error: ${upsertError.message}`);
        } else {
          imported += mapped.length;
        }
      }

      if (payouts.length < LIMIT) break;
      offset += LIMIT;
    }
  } catch (err) {
    console.error("Payouts sync error:", err);
  }

  return { imported, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Starting scheduled sync for all connected accounts...");

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all users with eBay connected (have refresh token) from secure credentials table
    const { data: userCredentials, error: credError } = await supabaseAdmin
      .from("user_ebay_credentials")
      .select("user_id, ebay_refresh_token, ebay_access_token, ebay_token_expires_at, ebay_signing_key_jwe, ebay_signing_private_key")
      .not("ebay_refresh_token", "is", null);

    if (credError) {
      console.error("Failed to fetch user credentials:", credError);
      return new Response(JSON.stringify({ error: credError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userCredentials || userCredentials.length === 0) {
      console.log("No connected eBay accounts found");
      return new Response(JSON.stringify({ message: "No accounts to sync", synced: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${userCredentials.length} connected accounts to sync`);

    const results: Array<{ userId: string; imported: number; errors: string[] }> = [];

    for (const credentials of userCredentials) {
      const userId = credentials.user_id;
      let accessToken = credentials.ebay_access_token;

      // Check if token needs refresh
      const expiresAt = credentials.ebay_token_expires_at ? new Date(credentials.ebay_token_expires_at) : null;
      const needsRefresh = !accessToken || !expiresAt || expiresAt <= new Date();

      if (needsRefresh && credentials.ebay_refresh_token) {
        console.log(`Refreshing token for user ${userId}`);
        accessToken = await refreshAccessToken(credentials.ebay_refresh_token);
        
        if (accessToken) {
          const expiresIn = 7200; // 2 hours
          const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
          
          // Update tokens in secure credentials table
          await supabaseAdmin
            .from("user_ebay_credentials")
            .update({
              ebay_access_token: accessToken,
              ebay_token_expires_at: newExpiresAt,
            })
            .eq("user_id", userId);
        }
      }

      if (!accessToken) {
        console.log(`Skipping user ${userId} - no valid access token`);
        results.push({ userId, imported: 0, errors: ["No valid access token"] });
        continue;
      }

      // Create import history record
      const { data: importRecord } = await supabaseAdmin
        .from("import_history")
        .insert({
          user_id: userId,
          type: "ebay-sync",
          status: "processing",
          file_name: "Scheduled Auto-Sync",
        })
        .select()
        .single();

      try {
        const result = await syncUserData(
          supabaseAdmin,
          userId,
          accessToken,
          credentials.ebay_signing_key_jwe,
          credentials.ebay_signing_private_key,
        );

        // Update import history
        if (importRecord) {
          await supabaseAdmin
            .from("import_history")
            .update({
              status: result.errors.length > 0 ? "completed_with_errors" : "completed",
              completed_at: new Date().toISOString(),
              row_count: result.imported,
              error_count: result.errors.length,
              errors: result.errors.length > 0 ? result.errors : null,
            })
            .eq("id", importRecord.id);
        }

        results.push({ userId, ...result });
        console.log(`Synced user ${userId}: ${result.imported} records, ${result.errors.length} errors`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Failed to sync user ${userId}:`, errorMsg);
        
        if (importRecord) {
          await supabaseAdmin
            .from("import_history")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              errors: [errorMsg],
            })
            .eq("id", importRecord.id);
        }

        results.push({ userId, imported: 0, errors: [errorMsg] });
      }
    }

    const totalImported = results.reduce((sum, r) => sum + r.imported, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    console.log(`Scheduled sync complete: ${results.length} accounts, ${totalImported} records, ${totalErrors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        accounts: results.length,
        totalImported,
        totalErrors,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Scheduled sync failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
