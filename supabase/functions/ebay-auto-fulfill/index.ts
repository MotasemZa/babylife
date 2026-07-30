import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function refreshAccessToken(supabase: any, userId: string, refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get("EBAY_CLIENT_ID");
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET");
  
  const credentials = btoa(`${clientId}:${clientSecret}`);
  
  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  
  if (!response.ok) {
    console.error("Failed to refresh token:", await response.text());
    return null;
  }
  
  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  
  // Update tokens in secure credentials table
  await supabase
    .from("user_ebay_credentials")
    .update({
      ebay_access_token: data.access_token,
      ebay_token_expires_at: expiresAt.toISOString(),
    })
    .eq("user_id", userId);
  
  return data.access_token;
}

async function getValidAccessToken(supabase: any, credentials: any): Promise<string | null> {
  const now = new Date();
  const expiresAt = credentials.ebay_token_expires_at ? new Date(credentials.ebay_token_expires_at) : null;
  
  if (credentials.ebay_access_token && expiresAt && expiresAt > now) {
    return credentials.ebay_access_token;
  }
  
  if (credentials.ebay_refresh_token) {
    return await refreshAccessToken(supabase, credentials.user_id, credentials.ebay_refresh_token);
  }
  
  return null;
}

async function fetchPaidOrders(accessToken: string): Promise<any[]> {
  console.log("Fetching paid orders from eBay...");
  
  // Fetch orders from the last 7 days that are paid but not yet fulfilled
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const response = await fetch(
    `https://api.ebay.com/sell/fulfillment/v1/order?filter=creationdate:[${sevenDaysAgo}..],orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}`,
    {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
        "Accept-Language": "de-DE",
      },
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to fetch orders:", errorText);
    return [];
  }
  
  const data = await response.json();
  console.log(`Found ${data.orders?.length || 0} orders to process`);
  
  // Filter only paid orders
  return (data.orders || []).filter((order: any) => 
    order.orderPaymentStatus === "PAID" || order.orderPaymentStatus === "FULLY_REFUNDED"
  ).filter((order: any) => order.orderPaymentStatus === "PAID");
}

type EbayOrderState = {
  fulfillmentStatus: string | null;
  paymentStatus: string | null;
  cancelState: string | null;
};

async function getOrderState(accessToken: string, orderId: string): Promise<EbayOrderState | null> {
  try {
    const response = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order/${orderId}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
      },
    });

    if (!response.ok) {
      // If the order can't be fetched (e.g. too old / not found), don't delete anything.
      console.warn(`Could not fetch order ${orderId} to verify state:`, await response.text());
      return null;
    }

    const order = await response.json();
    return {
      fulfillmentStatus: order?.orderFulfillmentStatus ?? null,
      paymentStatus: order?.orderPaymentStatus ?? null,
      cancelState: order?.cancelStatus?.cancelState ?? null,
    };
  } catch (err) {
    console.error(`Error checking order state for ${orderId}:`, err);
    return null;
  }
}

async function pruneFulfillmentLogsForFulfilledOrders(
  supabase: any,
  accessToken: string,
  userId: string,
  specificOrderId: string | null
): Promise<void> {
  // We only care about removing rows that still show up as "pending" in the UI.
  // If an order is already fulfilled OR cancelled/invalid on eBay, we delete its old log row.

  const statusesToPrune = ["failed", "processing", "pending", "partial"];

  const baseQuery = supabase
    .from("fulfillment_log")
    .select("order_id")
    .eq("user_id", userId)
    .in("status", statusesToPrune)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data, error } = specificOrderId
    ? await baseQuery.eq("order_id", specificOrderId)
    : await baseQuery;

  if (error) {
    console.error("Failed to load fulfillment logs for pruning:", error);
    return;
  }

  const uniqueOrderIds: string[] = [];
  const seen = new Set<string>();
  for (const row of data || []) {
    const oid = row.order_id;
    if (!oid || seen.has(oid)) continue;
    seen.add(oid);
    uniqueOrderIds.push(oid);
  }

  for (const orderId of uniqueOrderIds) {
    const state = await getOrderState(accessToken, orderId);
    if (!state) continue;

    const isFulfilled = state.fulfillmentStatus === "FULFILLED";
    const isCanceled = !!state.cancelState && state.cancelState !== "NONE_REQUESTED";
    const isNotPayable = !!state.paymentStatus && state.paymentStatus !== "PAID";

    if (isFulfilled || isCanceled || isNotPayable) {
      console.log(
        `Pruning fulfillment_log row for order ${orderId} (fulfillment=${state.fulfillmentStatus}, cancel=${state.cancelState}, payment=${state.paymentStatus})`
      );
      await supabase
        .from("fulfillment_log")
        .delete()
        .eq("user_id", userId)
        .eq("order_id", orderId);
    }
  }
}

interface MessageResult {
  success: boolean;
  error?: string;
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendEbayMessage(accessToken: string, buyerUsername: string, subject: string, message: string, itemId: string): Promise<MessageResult> {
  console.log(`Sending eBay message to ${buyerUsername} for item ${itemId}`);
  
  // Truncate subject to max 100 characters (eBay limit)
  const truncatedSubject = subject.length > 100 ? subject.substring(0, 97) + "..." : subject;
  
  try {
    const response = await fetch("https://api.ebay.com/post-order/v2/inquiry/send_message", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
      },
      body: JSON.stringify({
        recipientUsername: buyerUsername,
        subject: truncatedSubject,
        message: message,
      }),
    });
    
    if (!response.ok) {
      // Try the Trading API instead
      console.log("Post-order API failed, trying Trading API for messaging...");
      return await sendMessageViaTrading(accessToken, buyerUsername, truncatedSubject, message, itemId);
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error sending eBay message:", error);
    return await sendMessageViaTrading(accessToken, buyerUsername, truncatedSubject, message, itemId);
  }
}

async function sendMessageViaTrading(accessToken: string, buyerUsername: string, subject: string, message: string, itemId: string): Promise<MessageResult> {
  // Escape XML special characters
  const escapeXml = (str: string) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<AddMemberMessageAAQToPartnerRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <ItemID>${escapeXml(itemId)}</ItemID>
  <MemberMessage>
    <Subject>${escapeXml(subject)}</Subject>
    <Body>${escapeXml(message)}</Body>
    <RecipientID>${escapeXml(buyerUsername)}</RecipientID>
    <QuestionType>General</QuestionType>
  </MemberMessage>
</AddMemberMessageAAQToPartnerRequest>`;

  const response = await fetch("https://api.ebay.com/ws/api.dll", {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-SITEID": "77",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1225",
      "X-EBAY-API-CALL-NAME": "AddMemberMessageAAQToPartner",
      "X-EBAY-API-IAF-TOKEN": accessToken,
    },
    body: xmlBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Trading API message failed:", errorText);
    return { success: false, error: `HTTP ${response.status}: ${errorText.substring(0, 200)}` };
  }

  const responseText = await response.text();
  console.log("Trading API message response:", responseText);
  
  const isSuccess = responseText.includes("<Ack>Success</Ack>") || responseText.includes("<Ack>Warning</Ack>");
  
  if (!isSuccess) {
    // Extract error message from XML
    const longMessageMatch = responseText.match(/<LongMessage>([^<]+)<\/LongMessage>/);
    const shortMessageMatch = responseText.match(/<ShortMessage>([^<]+)<\/ShortMessage>/);
    const errorMsg = longMessageMatch?.[1] || shortMessageMatch?.[1] || "Unknown eBay error";
    return { success: false, error: errorMsg };
  }
  
  return { success: true };
}

async function markOrderFulfilled(accessToken: string, orderId: string, lineItemId: string, quantity: number): Promise<boolean> {
  console.log(`Marking order ${orderId} as fulfilled`);
  
  const response = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
    },
    body: JSON.stringify({
      lineItems: [{ lineItemId, quantity: Math.max(1, Number(quantity) || 1) }],
      shippedDate: new Date().toISOString(),
      // For digital items, we don't need tracking
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to mark as fulfilled:", errorText);
    return false;
  }
  
  return true;
}

interface InvoiceResult {
  success: boolean;
  error?: string;
}

async function sendInvoice(accessToken: string, orderId: string): Promise<InvoiceResult> {
  console.log(`Sending invoice for order ${orderId}`);
  
  // eBay automatically sends invoices for most orders, but we can try the Trading API
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<SendInvoiceRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <OrderID>${orderId}</OrderID>
</SendInvoiceRequest>`;

  try {
    const response = await fetch("https://api.ebay.com/ws/api.dll", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-SITEID": "77",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1225",
        "X-EBAY-API-CALL-NAME": "SendInvoice",
        "X-EBAY-API-IAF-TOKEN": accessToken,
      },
      body: xmlBody,
    });

    const responseText = await response.text();
    console.log("Invoice response:", responseText);
    
    const isSuccess = responseText.includes("<Ack>Success</Ack>") || responseText.includes("<Ack>Warning</Ack>");
    
    if (!isSuccess) {
      const longMessageMatch = responseText.match(/<LongMessage>([^<]+)<\/LongMessage>/);
      const shortMessageMatch = responseText.match(/<ShortMessage>([^<]+)<\/ShortMessage>/);
      const errorMsg = longMessageMatch?.[1] || shortMessageMatch?.[1] || "Unknown invoice error";
      return { success: false, error: errorMsg };
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error sending invoice:", error);
    return { success: false, error: String(error) };
  }
}

async function processOrder(
  supabase: any, 
  accessToken: string, 
  order: any, 
  userId: string
): Promise<void> {
  const orderId = order.orderId;
  const buyer = order.buyer;
  const buyerUsername = buyer?.username || "Unknown";
  const buyerEmail = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.email;
  
  console.log(`Processing order ${orderId} for buyer ${buyerUsername}`);
  
  // Atomic idempotency claim: try to INSERT a "processing" row.
  // If it conflicts (unique on order_id+user_id), another process already claimed this order.
  const { data: claimedLog, error: claimErr } = await supabase
    .from("fulfillment_log")
    .insert({
      user_id: userId,
      order_id: orderId,
      status: "processing",
      platform: "ebay",
      buyer_username: buyerUsername,
      buyer_email: buyerEmail,
    })
    .select()
    .single();

  if (claimErr) {
    if (claimErr.code === "23505") {
      // Check existing row state
      const { data: existingLog } = await supabase
        .from("fulfillment_log")
        .select("*")
        .eq("order_id", orderId)
        .eq("user_id", userId)
        .single();

      if (existingLog?.message_sent) {
        console.log(`Order ${orderId} already has keys sent, skipping`);
        return;
      }

      if (existingLog?.status === "processing") {
        // Stale-claim safeguard: if claim is older than 5 minutes, treat as abandoned and re-evaluate
        const ageMs = Date.now() - new Date(existingLog.created_at).getTime();
        if (ageMs > 5 * 60_000) {
          console.log(`Order ${orderId} processing claim is stale (${Math.round(ageMs / 1000)}s old), re-evaluating`);
          await supabase
            .from("fulfillment_log")
            .update({ error_message: null })
            .eq("id", existingLog.id);
          // fall through to line-item processing
        } else {
          console.log(`Order ${orderId} is being processed by another instance, skipping`);
          return;
        }
      }

      if (existingLog?.status === "completed") {
        console.log(`Order ${orderId} already completed, skipping`);
        return;
      }

      // Failed or skipped previously — allow re-evaluation by resetting to processing.
      // Skipped rows are re-checked because the listing may have been linked since.
      if (existingLog?.status === "failed" || existingLog?.status === "skipped") {
        console.log(`Order ${orderId} previously ${existingLog.status}, re-evaluating`);
        await supabase
          .from("fulfillment_log")
          .update({ status: "processing", error_message: null })
          .eq("id", existingLog.id);
      } else {
        console.log(`Order ${orderId} already claimed (status=${existingLog?.status}), skipping`);
        return;
      }
    } else {
      console.error(`Failed to claim order ${orderId}:`, claimErr);
      return;
    }
  } else {
    console.log(`Claimed order ${orderId} for processing`);
  }

  // Update claim row with item title metadata from first line item (always, regardless of linking)
  const firstLine = order.lineItems?.[0];
  if (firstLine) {
    await supabase
      .from("fulfillment_log")
      .update({
        item_title: firstLine.title,
        listing_id: firstLine.legacyItemId || firstLine.sku,
      })
      .eq("order_id", orderId)
      .eq("user_id", userId)
      .is("item_title", null);
  }

  // fulfillment_log is UNIQUE (order_id, user_id) — one row per order — but an
  // order can hold several line items. Writing a status per line item made each
  // one overwrite the last, so a two-item order where the first delivered and
  // the second was unlinked ended up displaying as "skipped" with keys already
  // sent. Collect per-line outcomes here and write the aggregate once, after the
  // loop.
  type LineOutcome = {
    ebayItemId: string;
    itemTitle: string;
    outcome: "delivered" | "partial" | "failed" | "skipped" | "disabled";
    error?: string;
    messageSent: boolean;
    invoiceSent: boolean;
    markedFulfilled: boolean;
    keyId?: string | null;
    inventoryItemId?: string | null;
    messageBody?: string;
  };
  const lineOutcomes: LineOutcome[] = [];

  // Get line items
  for (const lineItem of order.lineItems || []) {
    // eBay identifies the same line by legacyItemId and by sku, and which one is
    // populated varies by listing type. Keep both: a listing linked under one
    // identifier must still match when the order reports the other. Coerced to
    // string because legacyItemId arrives numeric on some responses while
    // platform_listing_id is TEXT — a number never matches a text column.
    const legacyItemId = lineItem.legacyItemId != null ? String(lineItem.legacyItemId) : null;
    const sku = lineItem.sku != null ? String(lineItem.sku) : null;
    const ebayItemId = legacyItemId || sku || "";
    const itemTitle = lineItem.title;
    const lineItemId = lineItem.lineItemId;
    const quantity = Math.max(1, Number(lineItem.quantity) || 1);

    console.log(`Processing line item ${ebayItemId} (legacy=${legacyItemId}, sku=${sku}): ${itemTitle}`);

    // Step 1: Find the platform_listing for this eBay item.
    // Matches either identifier. Deliberately NOT .single(): that errors on zero
    // rows AND on duplicates, and the error was being discarded — so a listing
    // with two platform_listings rows silently reported as "not linked".
    const candidateIds = [legacyItemId, sku].filter(Boolean) as string[];
    let platformListing: any = null;

    if (candidateIds.length > 0) {
      const { data: matches, error: listingErr } = await supabase
        .from("platform_listings")
        .select("*, inventory_items(*)")
        .eq("user_id", userId)
        .eq("platform", "ebay")
        .in("platform_listing_id", candidateIds)
        .order("created_at", { ascending: false });

      if (listingErr) {
        console.error(`platform_listings lookup failed for ${ebayItemId}:`, listingErr);
      }

      // Prefer a row that actually carries an inventory link over a bare one.
      platformListing =
        (matches || []).find((m: any) => m.inventory_item_id) || (matches || [])[0] || null;

      if ((matches?.length || 0) > 1) {
        console.warn(
          `${matches!.length} platform_listings rows match ${ebayItemId}; using ${platformListing?.id}`,
        );
      }
    }

    let inventoryItemId: string | null = null;
    let inventoryItem: any = null;

    if (platformListing?.inventory_item_id) {
      inventoryItemId = platformListing.inventory_item_id;
      inventoryItem = platformListing.inventory_items;
      console.log(`Found linked inventory item: ${inventoryItem?.name} (${inventoryItemId})`);

      // Check if auto-delivery is enabled for this inventory item
      if (inventoryItem?.auto_delivery_enabled === false) {
        console.log(`Auto-delivery disabled for inventory item ${inventoryItemId}, skipping`);
        lineOutcomes.push({
          ebayItemId, itemTitle, outcome: "disabled",
          error: "Auto-delivery disabled for this item",
          messageSent: false, invoiceSent: false, markedFulfilled: false,
          inventoryItemId,
        });
        continue;
      }
    } else {
      console.log(`No platform_listing found for eBay item ${ebayItemId}, recording as not linked`);
      lineOutcomes.push({
        ebayItemId, itemTitle, outcome: "skipped",
        error: "Listing not linked to inventory",
        messageSent: false, invoiceSent: false, markedFulfilled: false,
      });
      continue;
    }
    
    // Step 2: Find available keys (support quantity)
    let availableKeys: any[] | null = null;
    
    if (inventoryItemId) {
      // New schema: find keys by inventory_item_id
      const { data: keysByInventory } = await supabase
        .from("digital_keys")
        .select("*")
        .eq("user_id", userId)
        .eq("inventory_item_id", inventoryItemId)
        .eq("status", "available")
        .order("created_at", { ascending: true })
        .limit(quantity);
      
      availableKeys = keysByInventory || null;
    }
    
    // Fallback: try legacy listing_id lookup for backwards compatibility
    if (!availableKeys || availableKeys.length === 0) {
      const { data: keysByListing } = await supabase
        .from("digital_keys")
        .select("*")
        .eq("user_id", userId)
        .eq("listing_id", ebayItemId)
        .eq("status", "available")
        .order("created_at", { ascending: true })
        .limit(quantity);
      
      availableKeys = keysByListing || null;
    }


    if (!availableKeys || availableKeys.length < quantity) {
      console.log(`No key found for ${ebayItemId} / ${itemTitle}`);
      
      const errorMsg = `Need ${quantity} key(s) but only ${availableKeys?.length || 0} available`;

      lineOutcomes.push({
        ebayItemId, itemTitle, outcome: "failed", error: errorMsg,
        messageSent: false, invoiceSent: false, markedFulfilled: false,
        inventoryItemId,
      });

      // Log the failed attempt
      const { error: logError } = await supabase.from("fulfillment_log").upsert({
        user_id: userId,
        order_id: orderId,
        listing_id: ebayItemId,
        item_title: itemTitle,
        buyer_username: buyerUsername,
        buyer_email: buyerEmail,
        status: "failed",
        error_message: errorMsg,
        platform: "ebay",
        inventory_item_id: inventoryItemId,
      }, { onConflict: "order_id,user_id" });
      
      if (logError) {
        console.error("Failed to log failed attempt:", logError);
      } else {
        console.log(`Logged failed attempt for order ${orderId}`);
      }
      
      // Send Telegram notification for failed fulfillment
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            user_id: userId,
            type: "fulfillment_failed",
            data: {
              order_id: orderId,
              item_title: itemTitle,
              buyer_username: buyerUsername,
              error_message: errorMsg,
            },
          }),
        });
        console.log(`Telegram notification sent for failed order ${orderId}`);
      } catch (telegramError) {
        console.error("Failed to send Telegram notification:", telegramError);
      }
      
      continue;
    }

    const keysToSend = (availableKeys || []).slice(0, quantity);
    console.log(`Found ${keysToSend.length}/${quantity} key(s) for item ${ebayItemId}`);
    
    // Mark the order row in-flight. The final status is written once after the
    // loop; the return value is intentionally unused now, which also removes an
    // unguarded logEntry.id dereference that threw and aborted the whole order
    // whenever this upsert failed.
    const { error: inflightErr } = await supabase
      .from("fulfillment_log")
      .upsert({
        user_id: userId,
        order_id: orderId,
        listing_id: ebayItemId,
        item_title: itemTitle,
        buyer_username: buyerUsername,
        buyer_email: buyerEmail,
        digital_key_id: keysToSend[0]?.id ?? null,
        status: "processing",
        platform: "ebay",
        inventory_item_id: inventoryItemId || keysToSend[0]?.inventory_item_id,
      }, { onConflict: "order_id,user_id" });

    if (inflightErr) {
      console.error(`Failed to mark order ${orderId} in-flight:`, inflightErr);
    }

    // Build the delivery email body using inventory item's custom message if available
    let messageBody: string;
    
    const keyText = keysToSend.map((k: any) => k.digital_key).join("\n");
    const downloadUrl = inventoryItem?.download_url || keysToSend[0]?.download_url || "";

    if (inventoryItem?.delivery_message) {
      // Use custom delivery message from inventory item (supports multi-qty)
      messageBody = inventoryItem.delivery_message
        .replace(/{KEY}/g, keyText)
        .replace(/{DOWNLOAD_URL}/g, downloadUrl);
    } else {
      // Default message
      messageBody = `Vielen Dank für Ihren Kauf!\n\nHier ist Ihr digitaler Produktschlüssel:\n\n${keyText}`;
      if (downloadUrl) messageBody += `\n\nDownload-Link: ${downloadUrl}`;
      
      messageBody += `\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen`;
    }
    
    // EMAIL ONLY delivery (no eBay messages)
    const emailTo = (buyerEmail || "").trim();
    let messageResult: MessageResult = { success: false, error: "Missing buyer email" };

    if (emailTo) {
      const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/email-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          userId,
          to: emailTo,
          subject: `Your purchase: ${itemTitle || "Digital delivery"}`,
          html: `<pre style="white-space:pre-wrap">${escapeHtml(messageBody)}</pre>`,
          text: messageBody,
        }),
      }).then((r) => r.json().catch(() => ({})));

      messageResult = emailRes?.success
        ? { success: true }
        : { success: false, error: emailRes?.error || "Failed to send delivery email" };
    }

    // Only consume key + mark fulfilled after email success
    let markedFulfilled = false;
    if (messageResult.success) {
      const keyIds = keysToSend.map((k: any) => k.id);
      await supabase
        .from("digital_keys")
        .update({
          status: "used",
          order_id: orderId,
          used_at: new Date().toISOString(),
          platform: "ebay",
        })
        .in("id", keyIds);

      markedFulfilled = await markOrderFulfilled(accessToken, orderId, lineItemId, quantity);

      // Stock sync: update quantity on other linked platforms
      if (inventoryItemId) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/stock-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              userId,
              inventoryItemId,
              soldQuantity: quantity,
              sourcePlatform: "ebay",
            }),
          });
          console.log(`Stock sync triggered for inventory ${inventoryItemId} (sold ${quantity} on eBay)`);
        } catch (syncErr) {
          console.error("Stock sync error (non-fatal):", syncErr);
        }
      }
    }

    // Check if auto_send_invoice is enabled for this user
    const { data: userSettings } = await supabase
      .from("user_settings")
      .select("auto_send_invoice")
      .eq("user_id", userId)
      .maybeSingle();
    
    const autoSendInvoice = userSettings?.auto_send_invoice !== false; // default true

    // Invoice via our invoice system (email) - only if auto_send_invoice is enabled
    let invoiceResult: InvoiceResult = { success: false, error: "Invoice not generated" };
    if (!autoSendInvoice) {
      console.log(`Invoice auto-send disabled for user ${userId}, skipping invoice`);
      invoiceResult = { success: false, error: "disabled" }; // Skipped intentionally — "disabled" convention
    } else {
      try {
        const { data: txn } = await supabase
          .from("transactions")
          .select("id")
          .eq("user_id", userId)
          .eq("order_id", String(orderId))
          .eq("type", "sale")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (txn?.id && emailTo) {
          const invRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-invoice`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              transactionId: txn.id,
              buyerEmail: emailTo,
              sendEmail: true,
              userId,
            }),
          }).then((r) => r.json().catch(() => ({})));

          // generate-invoice returns success=true for invoice creation; use emailSent/emailError for delivery outcome
          invoiceResult = invRes?.emailSent
            ? { success: true }
            : { success: false, error: invRes?.emailError || invRes?.error || "Invoice send failed" };
        } else if (!txn?.id) {
          invoiceResult = { success: false, error: "Missing transaction for order; cannot generate invoice" };
        } else {
          invoiceResult = { success: false, error: "Missing buyer email; cannot send invoice" };
        }
      } catch (e) {
        invoiceResult = { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    
    // Build comprehensive error message
    const errors: string[] = [];
    if (!messageResult.success && messageResult.error) {
      errors.push(`Message: ${messageResult.error}`);
    }
    if (!invoiceResult.success && invoiceResult.error && invoiceResult.error !== "disabled") {
      errors.push(`Invoice: ${invoiceResult.error}`);
    }
    if (!markedFulfilled) {
      errors.push("Could not mark as fulfilled on eBay");
    }
    
    // Delivery is what actually matters to the buyer: if the email never went
    // out, this line failed, regardless of the eBay fulfilment call. Previously
    // any line with markedFulfilled=false became "partial", so a completely
    // undelivered order could sit in a status the Pending tab does not show.
    const lineOutcome: LineOutcome["outcome"] = !messageResult.success
      ? "failed"
      : markedFulfilled
        ? "delivered"
        : "partial";

    lineOutcomes.push({
      ebayItemId, itemTitle, outcome: lineOutcome,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      messageSent: messageResult.success,
      invoiceSent: invoiceResult.success,
      markedFulfilled,
      keyId: keysToSend[0]?.id ?? null,
      inventoryItemId,
      messageBody,
    });

    console.log(
      `Order ${orderId} line ${ebayItemId} -> ${lineOutcome} ` +
      `(message=${messageResult.success}, invoice=${invoiceResult.success}, fulfilled=${markedFulfilled})`,
    );
    
    // Send Telegram notification
    try {
      const notificationType = lineOutcome === "delivered" ? "fulfillment_success" : "fulfillment_failed";
      await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          type: notificationType,
          data: {
            order_id: orderId,
            item_title: itemTitle,
            buyer_username: buyerUsername,
            error_message: errors.length > 0 ? errors.join("; ") : undefined,
          },
        }),
      });
      console.log(`Telegram notification sent for order ${orderId}`);
    } catch (telegramError) {
      console.error("Failed to send Telegram notification:", telegramError);
    }
  }

  // ---------------------------------------------------------------------------
  // Aggregate the whole order into the single fulfillment_log row.
  // Runs once, after every line item, so no line can clobber another's status.
  // ---------------------------------------------------------------------------
  if (lineOutcomes.length === 0) {
    console.log(`Order ${orderId} had no line items to process`);
    return;
  }

  const delivered = lineOutcomes.filter((l) => l.outcome === "delivered");
  const partial   = lineOutcomes.filter((l) => l.outcome === "partial");
  const failed    = lineOutcomes.filter((l) => l.outcome === "failed");
  const skipped   = lineOutcomes.filter((l) => l.outcome === "skipped");
  const disabled  = lineOutcomes.filter((l) => l.outcome === "disabled");
  const succeeded = delivered.length + partial.length;

  let aggregateStatus: string;
  if (succeeded === 0) {
    // Nothing went out. "skipped" only when the sole reason is missing links or
    // a deliberate opt-out — otherwise it is a genuine failure needing attention.
    aggregateStatus = failed.length > 0 ? "failed" : "skipped";
  } else if (failed.length > 0 || skipped.length > 0 || partial.length > 0) {
    aggregateStatus = "partial";
  } else {
    aggregateStatus = "completed";
  }

  // Per-line detail, so a mixed order says exactly which item did what instead
  // of collapsing to one opaque message.
  const aggregateErrors = lineOutcomes
    .filter((l) => l.error)
    .map((l) => `${l.itemTitle || l.ebayItemId}: ${l.error}`);

  if (lineOutcomes.length > 1) {
    console.log(
      `Order ${orderId} aggregate: ${aggregateStatus} ` +
      `(delivered=${delivered.length} partial=${partial.length} failed=${failed.length} ` +
      `skipped=${skipped.length} disabled=${disabled.length} of ${lineOutcomes.length} lines)`,
    );
  }

  const firstSuccess = delivered[0] || partial[0];
  const { error: aggErr } = await supabase
    .from("fulfillment_log")
    .update({
      status: aggregateStatus,
      message_sent: lineOutcomes.some((l) => l.messageSent),
      invoice_sent: lineOutcomes.some((l) => l.invoiceSent),
      marked_fulfilled: lineOutcomes.length > 0 && lineOutcomes.every((l) => l.markedFulfilled),
      error_message: aggregateErrors.length > 0 ? aggregateErrors.join(" | ") : null,
      digital_key_id: firstSuccess?.keyId ?? null,
      inventory_item_id: firstSuccess?.inventoryItemId ?? lineOutcomes[0]?.inventoryItemId ?? null,
      message_body: firstSuccess?.messageBody ?? null,
      listing_id: lineOutcomes[0]?.ebayItemId ?? null,
    })
    .eq("order_id", orderId)
    .eq("user_id", userId);

  if (aggErr) {
    console.error(`Failed to write aggregate status for order ${orderId}:`, aggErr);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Check if this is a manual trigger with auth, or a cron job
    const authHeader = req.headers.get("Authorization");
    let targetUserId: string | null = null;
    let specificOrderId: string | null = null;
    let forceManualFulfill = false; // Only true when user clicks "Fulfill" on a specific order
    
    // Parse request body for specific order ID (manual fulfillment)
    if (req.method === "POST") {
      try {
        const body = await req.json();
        specificOrderId = body?.orderId || null;
        forceManualFulfill = body?.forceManual === true; // Explicit manual fulfill bypasses auto-delivery check
      } catch {
        // No body or invalid JSON, continue without specific order
      }
    }
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      
      // Try to verify as a user token first
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        targetUserId = user.id;
      }
    }
    
    // Get all users with eBay connected from credentials table, join with settings for auto_delivery_enabled
    // First get credentials
    let credQuery = supabase
      .from("user_ebay_credentials")
      .select("user_id, ebay_access_token, ebay_refresh_token, ebay_token_expires_at")
      .not("ebay_refresh_token", "is", null);
    
    if (targetUserId) {
      credQuery = credQuery.eq("user_id", targetUserId);
    }
    
    const { data: allCredentials, error: credError } = await credQuery;
    
    if (credError) {
      throw new Error(`Failed to fetch credentials: ${credError.message}`);
    }
    
    const results: any[] = [];
    
    for (const creds of allCredentials || []) {
      try {
        // Check auto_delivery_enabled from user_settings (unless forceManualFulfill)
        const shouldFilterByAutoDelivery = !forceManualFulfill;
        if (shouldFilterByAutoDelivery) {
          const { data: settings } = await supabase
            .from("user_settings")
            .select("auto_delivery_enabled")
            .eq("user_id", creds.user_id)
            .single();
          
          if (settings?.auto_delivery_enabled === false) {
            console.log(`Skipping user ${creds.user_id} - auto delivery disabled`);
            continue;
          }
        }
        
        const accessToken = await getValidAccessToken(supabase, creds);
        
        if (!accessToken) {
          console.log(`No valid access token for user ${creds.user_id}`);
          continue;
        }

        // Clean up old pending logs for orders that were already fulfilled manually on eBay
        await pruneFulfillmentLogsForFulfilledOrders(
          supabase,
          accessToken,
          creds.user_id,
          specificOrderId
        );
        
        let orders: any[] = [];
        
        if (specificOrderId) {
          // Manual fulfillment - fetch specific order
          console.log(`Manual fulfillment for order: ${specificOrderId}`);
          const response = await fetch(
            `https://api.ebay.com/sell/fulfillment/v1/order/${specificOrderId}`,
            {
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
              },
            }
          );
          
          if (response.ok) {
            const order = await response.json();
            orders = [order];
          } else {
            console.error("Failed to fetch specific order:", await response.text());
          }
        } else {
          // Auto-fulfillment - fetch all paid orders
          orders = await fetchPaidOrders(accessToken);
        }
        
        for (const order of orders) {
          await processOrder(supabase, accessToken, order, creds.user_id);
        }
        
        results.push({
          userId: creds.user_id,
          ordersProcessed: orders.length,
        });
      } catch (userError: unknown) {
        console.error(`Error processing user ${creds.user_id}:`, userError);
        results.push({
          userId: creds.user_id,
          error: userError instanceof Error ? userError.message : String(userError),
        });
      }
    }
    
    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Auto-fulfill error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
