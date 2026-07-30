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

const LIMIT = 200;
const MAX_PAGES_PER_INVOCATION = 3; // hard limit to prevent timeouts

type Stage = "orders" | "finances" | "payouts";

type Cursor = {
  stage: Stage;
  offset: number;
};

const parseEbayError = async (res: Response) => {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    const first = json?.errors?.[0];
    const message = first?.longMessage || first?.message || text;
    return { message, raw: json };
  } catch {
    return { message: text, raw: text };
  }
};

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
    signatureBase +=
      `"@signature-params": ("content-digest" "x-ebay-signature-key" "@method" "@path" "@authority");created=${timestamp}`;
    coveredComponents =
      `("content-digest" "x-ebay-signature-key" "@method" "@path" "@authority");created=${timestamp}`;
  } else {
    signatureBase = `"x-ebay-signature-key": ${jwe}\n`;
    signatureBase += `"@method": ${methodValue}\n`;
    signatureBase += `"@path": ${path}\n`;
    signatureBase += `"@authority": ${authority}\n`;
    signatureBase +=
      `"@signature-params": ("x-ebay-signature-key" "@method" "@path" "@authority");created=${timestamp}`;
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
      console.log("Request signed with eBay Digital Signature");
    } catch (signError) {
      console.error("Failed to sign request:", signError);
    }
  }

  return fetch(url, { method, headers, body: body || undefined });
}

function stageLabel(stage: Stage) {
  if (stage === "orders") return "Orders";
  if (stage === "finances") return "Finances";
  return "Payouts";
}

function computeOverallPercent(stages: Stage[], stage: Stage, stagePercent: number) {
  const idx = Math.max(0, stages.indexOf(stage));
  const denom = Math.max(1, stages.length);
  const overall = Math.round(((idx + stagePercent / 100) / denom) * 100);
  return Math.max(0, Math.min(100, overall));
}

type ChunkResult = {
  imported: number;
  errors: Array<{ type: string; message: string; id?: string; orderId?: string }>;
  nextOffset: number;
  done: boolean;
  total?: number;
  fetched: number;
  signatureRequired?: boolean;
};

async function fetchOrdersChunk(opts: {
  accessToken: string;
  userId: string;
  ordersStartDate?: string;
  endDate?: string;
  offset: number;
  supabaseAdmin: any;
}): Promise<ChunkResult> {
  const { accessToken, userId, ordersStartDate, endDate, supabaseAdmin } = opts;
  let offset = opts.offset;

  const ebayHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  let imported = 0;
  const errors: ChunkResult["errors"] = [];
  let total: number | undefined;

  for (let page = 0; page < MAX_PAGES_PER_INVOCATION; page++) {
    const ordersUrl = new URL(`${EBAY_API_BASE}/sell/fulfillment/v1/order`);

    if (ordersStartDate && endDate) {
      ordersUrl.searchParams.set(
        "filter",
        `creationdate:[${ordersStartDate}T00:00:00.000Z..${endDate}T23:59:59.999Z]`,
      );
    } else if (ordersStartDate) {
      ordersUrl.searchParams.set("filter", `creationdate:[${ordersStartDate}T00:00:00.000Z..]`);
    } else if (endDate) {
      ordersUrl.searchParams.set("filter", `creationdate:[..${endDate}T23:59:59.999Z]`);
    }

    ordersUrl.searchParams.set("limit", String(LIMIT));
    ordersUrl.searchParams.set("offset", String(offset));

    const res = await fetch(ordersUrl.toString(), { headers: ebayHeaders });

    if (!res.ok) {
      const parsed = await parseEbayError(res);
      console.error("eBay Orders API Error:", res.status, parsed.raw);
      errors.push({ type: "orders", message: `Orders API ${res.status}: ${parsed.message}` });
      return { imported, errors, nextOffset: offset, done: true, total, fetched: offset };
    }

    const data = await res.json();
    const orders: Array<Record<string, unknown>> = Array.isArray(data?.orders) ? data.orders : [];
    total = typeof data?.total === "number" ? data.total : total;

    console.log(`eBay Fetch: Retrieved ${orders.length} orders (offset: ${offset})`);

    if (orders.length > 0) {
      const txns: any[] = [];
      const buyerAddresses: any[] = [];

      for (const order of orders) {
        const lineItems = (order.lineItems as Record<string, unknown>[]) || [];
        const firstItem = lineItems[0] || {};

        const pricingSummary = order.pricingSummary as Record<string, unknown> | undefined;
        const totalObj = pricingSummary?.total as Record<string, unknown> | undefined;
        const deliveryCost = pricingSummary?.deliveryCost as Record<string, unknown> | undefined;
        const pricingTax = pricingSummary?.tax as Record<string, unknown> | undefined;
        const totalFeeBasisAmount = order.totalFeeBasisAmount as Record<string, unknown> | undefined;
        
        // Extract buyer country from shipping address (most accurate for tax purposes)
        const fulfillmentInstructions = order.fulfillmentStartInstructions as Array<Record<string, unknown>> | undefined;
        const shippingStep = fulfillmentInstructions?.[0]?.shippingStep as Record<string, unknown> | undefined;
        const shipTo = shippingStep?.shipTo as Record<string, unknown> | undefined;
        const shipToAddress = shipTo?.contactAddress as Record<string, unknown> | undefined;
        
        // Fallback to buyer registration address if no shipping address
        const buyer = order.buyer as Record<string, unknown> | undefined;
        const buyerAddress = buyer?.buyerRegistrationAddress as Record<string, unknown> | undefined;
        const buyerContactAddress = buyerAddress?.contactAddress as Record<string, unknown> | undefined;
        
        // Priority: shipping address > buyer contact address > buyer registration country
        const buyerCountry = (shipToAddress?.countryCode as string) 
          || (buyerContactAddress?.countryCode as string) 
          || (buyerAddress?.countryCode as string) 
          || "US";

        const gross = parseFloat((totalObj?.value as string) || "0");
        const fees = parseFloat((totalFeeBasisAmount?.value as string) || "0") * 0.12;
        const shippingCost = parseFloat((deliveryCost?.value as string) || "0");

        // EU/UK: eBay-collected VAT is exposed on line items as ebayCollectAndRemitTaxes[].amount
        const ebayCollectedTaxFromLineItems = lineItems.reduce((sum: number, item: any) => {
          const taxes: any[] = Array.isArray(item?.ebayCollectAndRemitTaxes) ? item.ebayCollectAndRemitTaxes : [];
          return sum + taxes.reduce((s: number, t: any) => s + parseFloat(String(t?.amount?.value ?? "0")), 0);
        }, 0);

        const taxCollected = ebayCollectedTaxFromLineItems > 0
          ? ebayCollectedTaxFromLineItems
          : parseFloat((pricingTax?.value as string) || "0");

        const orderId = String(order.orderId ?? "");

        const titleRaw = (firstItem as any)?.title;
        const skuRaw = (firstItem as any)?.sku;

        txns.push({
          user_id: userId,
          external_id: orderId,
          date: order.creationDate as string,
          type: "sale",
          order_id: orderId,
          item_title: typeof titleRaw === "string" ? titleRaw : "Unknown Item",
          sku: typeof skuRaw === "string" ? skuRaw : null,
          quantity: lineItems.reduce((sum: number, item: Record<string, unknown>) => sum + ((item.quantity as number) || 1), 0),
          gross: gross,
          fees: fees,
          shipping_charged: shippingCost,
          shipping_cost: shippingCost * 0.8,
          tax_collected: taxCollected,
          refunds: 0,
          net: gross - fees - shippingCost * 0.8,
          currency: (totalObj?.currency as string) || "USD",
          buyer_country: buyerCountry,
          category: "Uncategorized",
          status: "unmatched",
          raw_data: order,
        });

        // Extract buyer address for invoice generation
        const address = shipToAddress || buyerContactAddress;
        if (address || buyer) {
          const fullName = (shipTo?.fullName as string) 
            || (buyer?.username as string) 
            || "Unknown Buyer";
          
          const buyerEmail = (buyer?.email as string) || null;
          const buyerUsername = (buyer?.username as string) || null;
          
          buyerAddresses.push({
            user_id: userId,
            order_id: orderId,
            buyer_username: buyerUsername,
            buyer_email: buyerEmail,
            full_name: fullName,
            street_address: (address?.addressLine1 as string) || null,
            city: (address?.city as string) || null,
            state_province: (address?.stateOrProvince as string) || null,
            postal_code: (address?.postalCode as string) || null,
            country_code: (address?.countryCode as string) || buyerCountry,
            country_name: (address?.country as string) || null,
            phone: ((shipTo?.primaryPhone as Record<string, unknown>)?.phoneNumber as string) || null,
            raw_data: { shipTo, buyer },
          });
        }
      }

      const { error: upsertError } = await supabaseAdmin.from("transactions").upsert(txns, {
        onConflict: "user_id,external_id",
        ignoreDuplicates: true,
      });

      if (upsertError) {
        console.error("Orders upsert error:", upsertError);
        errors.push({ type: "orders", message: upsertError.message });
      } else {
        imported += txns.length;
      }

      // Upsert buyer addresses
      if (buyerAddresses.length > 0) {
        const { error: addressError } = await supabaseAdmin.from("buyer_addresses").upsert(buyerAddresses, {
          onConflict: "user_id,order_id",
          ignoreDuplicates: true,
        });

        if (addressError) {
          console.error("Buyer addresses upsert error:", addressError);
          errors.push({ type: "addresses", message: addressError.message });
        } else {
          console.log(`Stored ${buyerAddresses.length} buyer addresses`);
        }
      }
    }

    if (orders.length < LIMIT) {
      return { imported, errors, nextOffset: offset, done: true, total, fetched: offset + orders.length };
    }

    offset += LIMIT;
  }

  return { imported, errors, nextOffset: offset, done: false, total, fetched: offset };
}

async function fetchFinancesChunk(opts: {
  accessToken: string;
  userId: string;
  startDate?: string;
  endDate?: string;
  offset: number;
  signingKeyJwe: string | null;
  signingPrivateKey: string | null;
  supabaseAdmin: any;
}): Promise<ChunkResult> {
  const { accessToken, userId, startDate, endDate, signingKeyJwe, signingPrivateKey, supabaseAdmin } = opts;
  let offset = opts.offset;

  let imported = 0;
  const errors: ChunkResult["errors"] = [];
  let total: number | undefined;

  for (let page = 0; page < MAX_PAGES_PER_INVOCATION; page++) {
    const financeUrl = new URL(`${EBAY_APIZ_BASE}/sell/finances/v1/transaction`);

    if (startDate) {
      financeUrl.searchParams.set(
        "filter",
        `transactionDate:[${startDate}T00:00:00.000Z..${(endDate || new Date().toISOString().split("T")[0])}T23:59:59.999Z]`,
      );
    }

    financeUrl.searchParams.set("limit", String(LIMIT));
    financeUrl.searchParams.set("offset", String(offset));

    const res = await makeSignedRequest(financeUrl.toString(), accessToken, signingKeyJwe, signingPrivateKey);

    if (!res.ok) {
      const parsed = await parseEbayError(res);
      console.error("eBay Finances API Error:", res.status, parsed.raw);

      const msg = String(parsed.message || "").toLowerCase();
      const signatureRelated = msg.includes("x-ebay-signature-key") || msg.includes("signature");

      if (signatureRelated) {
        errors.push({
          type: "finances",
          message: !signingKeyJwe
            ? "Finances requires eBay Digital Signatures for EU/UK sellers. Click \"Generate Signing Keys\" to enable this feature."
            : `Finances signature error: ${parsed.message}. Your signing keys may be invalid or expired.`,
        });
        return {
          imported,
          errors,
          nextOffset: offset,
          done: true,
          total,
          fetched: offset,
          signatureRequired: true,
        };
      }

      errors.push({ type: "finances", message: `Finances API ${res.status}: ${parsed.message}` });
      return { imported, errors, nextOffset: offset, done: true, total, fetched: offset };
    }

    const data = await res.json();
    const txns: any[] = Array.isArray(data?.transactions) ? data.transactions : [];
    total = typeof data?.total === "number" ? data.total : total;

    console.log(`eBay Fetch: Retrieved ${txns.length} financial transactions (offset: ${offset})`);

     const mapped = txns
       .map((txn) => {
         let type = "fee";
         if (txn.transactionType === "SALE") type = "sale";
         else if (txn.transactionType === "REFUND") type = "refund";
         else if (txn.transactionType === "PAYOUT") type = "payout";
         else if (txn.transactionType === "SHIPPING_LABEL") type = "shipping";

         // SALE transactions are already created from the Orders API.
         // We use Finances only to enrich sales with eBay-collected tax amounts.
         if (type === "sale") return null;

         const amount = parseFloat(txn.amount?.value || "0");
         const fees = parseFloat(txn.totalFeeAmount?.value || "0");

         return {
           user_id: userId,
           external_id: String(txn.transactionId ?? ""),
           date: String(txn.transactionDate ?? ""),
           type: type,
           order_id: txn.orderId ? String(txn.orderId) : null,
           item_title: typeof txn.transactionMemo === "string" ? txn.transactionMemo : `${txn.transactionType} Transaction`,
           gross: Math.abs(amount),
           fees: Math.abs(fees),
           net: amount,
           currency: txn.amount?.currency || "USD",
           category: type === "fee" ? "Marketplace Fees" : "Uncategorized",
           status: "unmatched",
           raw_data: txn,
         };
       })
       .filter(Boolean) as any[];

     // Update tax_collected for SALE transactions when eBay reports eBayCollectedTaxAmount.
     const saleTaxUpdates = txns
       .map((txn) => {
         if (txn?.transactionType !== "SALE") return null;
         const orderId = txn.orderId ? String(txn.orderId) : "";
         const taxValue = parseFloat(txn.eBayCollectedTaxAmount?.value || "0");
         const currency = txn.eBayCollectedTaxAmount?.currency || txn.amount?.currency || "USD";
         if (!orderId || !(taxValue > 0)) return null;
         return { orderId, taxValue, currency };
       })
       .filter(Boolean) as Array<{ orderId: string; taxValue: number; currency: string }>;

     if (saleTaxUpdates.length > 0) {
       for (const u of saleTaxUpdates) {
         // Use order_id column since Orders API stores orderId there as well as external_id
         const { error: updateError } = await supabaseAdmin
           .from("transactions")
           .update({ tax_collected: u.taxValue })
           .eq("user_id", userId)
           .eq("order_id", u.orderId)
           .eq("type", "sale");

         if (updateError) {
           console.error("Finances SALE tax update error:", updateError);
           errors.push({ type: "finances", message: updateError.message, orderId: u.orderId });
         } else {
           console.log(`Updated tax_collected=${u.taxValue} for order ${u.orderId}`);
           imported += 1;
         }
       }
     }

    if (mapped.length > 0) {
      const { error: upsertError } = await supabaseAdmin.from("transactions").upsert(mapped, {
        onConflict: "user_id,external_id",
        ignoreDuplicates: true,
      });

      if (upsertError) {
        console.error("Finances upsert error:", upsertError);
        errors.push({ type: "finances", message: upsertError.message });
      } else {
        imported += mapped.length;
      }
    }

    if (txns.length < LIMIT) {
      return { imported, errors, nextOffset: offset, done: true, total, fetched: offset + txns.length };
    }

    offset += LIMIT;
  }

  return { imported, errors, nextOffset: offset, done: false, total, fetched: offset };
}

async function fetchPayoutsChunk(opts: {
  accessToken: string;
  userId: string;
  startDate?: string;
  endDate?: string;
  offset: number;
  signingKeyJwe: string | null;
  signingPrivateKey: string | null;
  supabaseAdmin: any;
}): Promise<ChunkResult> {
  const { accessToken, userId, startDate, endDate, signingKeyJwe, signingPrivateKey, supabaseAdmin } = opts;
  let offset = opts.offset;

  let imported = 0;
  const errors: ChunkResult["errors"] = [];
  let total: number | undefined;

  for (let page = 0; page < MAX_PAGES_PER_INVOCATION; page++) {
    const payoutsUrl = new URL(`${EBAY_APIZ_BASE}/sell/finances/v1/payout`);

    if (startDate) {
      payoutsUrl.searchParams.set(
        "filter",
        `payoutDate:[${startDate}T00:00:00.000Z..${(endDate || new Date().toISOString().split("T")[0])}T23:59:59.999Z]`,
      );
    }

    payoutsUrl.searchParams.set("limit", String(LIMIT));
    payoutsUrl.searchParams.set("offset", String(offset));

    const res = await makeSignedRequest(payoutsUrl.toString(), accessToken, signingKeyJwe, signingPrivateKey);

    if (!res.ok) {
      const parsed = await parseEbayError(res);
      console.error("eBay Payouts API Error:", res.status, parsed.raw);

      const msg = String(parsed.message || "").toLowerCase();
      const signatureRelated = msg.includes("x-ebay-signature-key") || msg.includes("signature");

      if (signatureRelated) {
        errors.push({
          type: "payouts",
          message: !signingKeyJwe
            ? "Payouts requires eBay Digital Signatures for EU/UK sellers. Click \"Generate Signing Keys\" to enable this feature."
            : `Payouts signature error: ${parsed.message}. Your signing keys may be invalid or expired.`,
        });
        return {
          imported,
          errors,
          nextOffset: offset,
          done: true,
          total,
          fetched: offset,
          signatureRequired: true,
        };
      }

      errors.push({ type: "payouts", message: `Payouts API ${res.status}: ${parsed.message}` });
      return { imported, errors, nextOffset: offset, done: true, total, fetched: offset };
    }

    const data = await res.json();
    const payouts: any[] = Array.isArray(data?.payouts) ? data.payouts : [];
    total = typeof data?.total === "number" ? data.total : total;

    console.log(`eBay Fetch: Retrieved ${payouts.length} payouts (offset: ${offset})`);

    if (payouts.length > 0) {
      const mapped = payouts.map((payout) => {
        const payoutId = String(payout.payoutId ?? "");
        const amt = parseFloat(payout.amount?.value || "0");
        return {
          user_id: userId,
          external_id: payoutId,
          payout_date: String(payout.payoutDate ?? ""),
          payout_id: payoutId,
          gross: amt,
          fees: 0,
          adjustments: 0,
          net: amt,
          status:
            payout.payoutStatus === "SUCCEEDED"
              ? "completed"
              : payout.payoutStatus === "PENDING"
                ? "pending"
                : "failed",
          transaction_count: payout.transactionCount || 0,
          raw_data: payout,
        };
      });

      const { error: upsertError } = await supabaseAdmin.from("payouts").upsert(mapped, {
        onConflict: "user_id,external_id",
        ignoreDuplicates: true,
      });

      if (upsertError) {
        console.error("Payouts upsert error:", upsertError);
        errors.push({ type: "payouts", message: upsertError.message });
      } else {
        imported += mapped.length;
      }
    }

    if (payouts.length < LIMIT) {
      return { imported, errors, nextOffset: offset, done: true, total, fetched: offset + payouts.length };
    }

    offset += LIMIT;
  }

  return { imported, errors, nextOffset: offset, done: false, total, fetched: offset };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // We'll store these so we can mark a run as failed if something throws.
  let importIdForFailure: string | undefined;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) throw new Error("Invalid token");

    const body = await req.json();
    const action: Stage | "all" = body.action;
    const rawStartDate: string | undefined = body.startDate || undefined;
    const rawEndDate: string | undefined = body.endDate || undefined;
    const cursor: Cursor | null = body.cursor || null;
    const importId: string | undefined = body.importId || undefined;

    // Sanitize dates: eBay rejects future dates, so cap to yesterday (UTC)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const maxDateStr = yesterday.toISOString().split("T")[0];

    // Orders API has a max 2-year lookback limit - be conservative with a buffer
    const twoYearsAgo = new Date(today);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    twoYearsAgo.setUTCDate(twoYearsAgo.getUTCDate() + 2); // extra safety buffer
    const minOrdersStartDate = twoYearsAgo.toISOString().split("T")[0];

    const startDate = rawStartDate || undefined;
    const endDate = rawEndDate && rawEndDate > maxDateStr ? maxDateStr : rawEndDate;
    const ordersStartDate = startDate && startDate < minOrdersStartDate ? minOrdersStartDate : startDate;

    const stages: Stage[] = action === "all" ? ["orders", "finances", "payouts"] : [action];

    const currentStage: Stage = cursor?.stage || stages[0];
    const currentOffset: number = typeof cursor?.offset === "number" ? cursor.offset : 0;

    console.log(
      `eBay Fetch: action=${action}, stage=${currentStage}, offset=${currentOffset}, startDate=${startDate}, ordersStartDate=${ordersStartDate}, endDate=${endDate}, user=${user.id}`,
    );

    // Load credentials from secure table (token + signing keys)
    const { data: credentials, error: credError } = await supabaseAdmin
      .from("user_ebay_credentials")
      .select("ebay_access_token, ebay_token_expires_at, ebay_signing_key_jwe, ebay_signing_private_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (credError || !credentials?.ebay_access_token) {
      throw new Error("eBay not connected. Please connect your eBay account first.");
    }

    if (new Date(credentials.ebay_token_expires_at) < new Date()) {
      throw new Error("eBay token expired. Please reconnect your account.");
    }

    const accessToken = credentials.ebay_access_token;
    const signingKeyJwe = credentials.ebay_signing_key_jwe || null;
    const signingPrivateKey = credentials.ebay_signing_private_key || null;

    // Create (or reuse) import history record
    let importRecord:
      | {
          id: string;
          row_count: number | null;
          error_count: number | null;
          errors: unknown;
        }
      | null = null;

    if (importId) {
      const { data, error } = await supabaseAdmin
        .from("import_history")
        .select("id, row_count, error_count, errors")
        .eq("id", importId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) {
        throw new Error("Could not resume sync run. Please try again.");
      }

      importRecord = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("import_history")
        .insert({
          user_id: user.id,
          type: "ebay",
          file_name: `eBay API Sync - ${action}`,
          status: "processing",
        })
        .select("id, row_count, error_count, errors")
        .single();

      if (error) {
        console.error("Failed to create import record:", error);
      } else {
        importRecord = data;
      }
    }

    if (!importRecord) {
      throw new Error("Failed to create sync run.");
    }

    importIdForFailure = importRecord.id;

    // Run one chunk
    let chunk: ChunkResult;
    if (currentStage === "orders") {
      chunk = await fetchOrdersChunk({
        accessToken,
        userId: user.id,
        ordersStartDate,
        endDate,
        offset: currentOffset,
        supabaseAdmin,
      });
    } else if (currentStage === "finances") {
      chunk = await fetchFinancesChunk({
        accessToken,
        userId: user.id,
        startDate,
        endDate,
        offset: currentOffset,
        signingKeyJwe,
        signingPrivateKey,
        supabaseAdmin,
      });
    } else {
      chunk = await fetchPayoutsChunk({
        accessToken,
        userId: user.id,
        startDate,
        endDate,
        offset: currentOffset,
        signingKeyJwe,
        signingPrivateKey,
        supabaseAdmin,
      });
    }

    const prevRows = importRecord.row_count || 0;
    const prevErrCount = importRecord.error_count || 0;
    const prevErrorsArr = Array.isArray(importRecord.errors) ? (importRecord.errors as any[]) : [];

    const nextRows = prevRows + chunk.imported;
    const nextErrorsArr = prevErrorsArr.concat(chunk.errors);
    const nextErrCount = prevErrCount + chunk.errors.length;

    // Figure out next cursor
    let done = false;
    let nextCursor: Cursor | null = null;

    if (chunk.signatureRequired && !signingKeyJwe && (currentStage === "finances" || currentStage === "payouts")) {
      // Can't proceed further without keys.
      done = true;
    } else if (!chunk.done) {
      nextCursor = { stage: currentStage, offset: chunk.nextOffset };
    } else {
      const idx = stages.indexOf(currentStage);
      const nextStage = stages[idx + 1];
      if (nextStage) {
        nextCursor = { stage: nextStage, offset: 0 };
      } else {
        done = true;
      }
    }

    const stagePct = chunk.total
      ? Math.round((Math.min(chunk.fetched, chunk.total) / Math.max(1, chunk.total)) * 100)
      : chunk.done
        ? 100
        : 25;

    const overallPercent = computeOverallPercent(stages, currentStage, stagePct);

    const message = chunk.total
      ? `Pulling ${stageLabel(currentStage)} (${Math.min(chunk.fetched, chunk.total).toLocaleString()} of ${chunk.total.toLocaleString()})`
      : `Pulling ${stageLabel(currentStage)}…`;

    await supabaseAdmin
      .from("import_history")
      .update({
        status: done ? "completed" : "processing",
        row_count: nextRows,
        error_count: nextErrCount,
        errors: nextErrorsArr.length > 0 ? nextErrorsArr : null,
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq("id", importRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        importId: importRecord.id,
        done,
        nextCursor,
        progress: {
          stage: currentStage,
          message,
          overallPercent,
        },
        rowsImported: chunk.imported,
        rowsImportedTotal: nextRows,
        errorCount: nextErrCount,
        errors: nextErrorsArr.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("eBay Fetch Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    // Best-effort: mark run as failed so it doesn't stick on "processing"
    if (importIdForFailure) {
      try {
        await supabaseAdmin
          .from("import_history")
          .update({
            status: "failed",
            error_count: 1,
            errors: [{ type: "sync", message }],
            completed_at: new Date().toISOString(),
          })
          .eq("id", importIdForFailure);
      } catch (e) {
        console.error("Failed to mark import run failed:", e);
      }
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
