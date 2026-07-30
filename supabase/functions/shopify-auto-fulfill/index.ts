import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ShopifyOrder {
  id: number;
  name: string;
  email: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
  customer: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
  billing_address?: {
    name?: string;
    address1?: string;
    address2?: string;
    zip?: string;
    city?: string;
    province?: string;
    country?: string;
    country_code?: string;
  } | null;
  shipping_address?: {
    name?: string;
    address1?: string;
    address2?: string;
    zip?: string;
    city?: string;
    province?: string;
    country?: string;
    country_code?: string;
  } | null;
  line_items: Array<{
    id: number;
    title: string;
    quantity: number;
    price: string;
    sku: string;
    product_id: number;
    variant_id: number;
  }>;
}

function formatShopifyAddress(addr: ShopifyOrder["billing_address"] | ShopifyOrder["shipping_address"]): { name: string; address: string } {
  const name = String(addr?.name || "").trim();
  const parts = [
    addr?.address1,
    addr?.address2,
    addr?.city,
    addr?.province,
    addr?.zip,
    addr?.country || addr?.country_code,
  ].filter(Boolean) as string[];
  return { name, address: parts.join("\n") };
}

async function fetchShopifyOrders(
  shopDomain: string,
  accessToken: string
): Promise<ShopifyOrder[]> {
  console.log("Fetching unfulfilled paid orders from Shopify...");
  
  const response = await fetch(
    `https://${shopDomain}/admin/api/2024-01/orders.json?fulfillment_status=unfulfilled&financial_status=paid&limit=50`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Shopify API error:", error);
    throw new Error(`Failed to fetch orders: ${response.status}`);
  }

  const data = await response.json();
  console.log(`Found ${data.orders?.length || 0} Shopify orders to process`);
  return data.orders || [];
}

async function fulfillShopifyOrder(
  shopDomain: string,
  accessToken: string,
  orderId: number
): Promise<{ ok: boolean; error?: string }> {
  console.log(`Marking Shopify order ${orderId} as fulfilled`);

  const isClosedUnfulfillable = (raw: string) =>
    /unfulfillable\s+status\s*=\s*closed/i.test(raw);

  const fetchOrderFulfillmentStatus = async ():
    Promise<{ fulfillment_status: string | null; fulfillments_count: number } | null> => {
    try {
      const r = await fetch(
        `https://${shopDomain}/admin/api/2024-01/orders/${orderId}.json?fields=id,fulfillment_status,fulfillments`,
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        }
      );
      if (!r.ok) return null;
      const j = await r.json().catch(() => null);
      const o = j?.order;
      return {
        fulfillment_status: o?.fulfillment_status ?? null,
        fulfillments_count: Array.isArray(o?.fulfillments) ? o.fulfillments.length : 0,
      };
    } catch {
      return null;
    }
  };
  
  // First, get the fulfillment order
  const fulfillmentOrdersResponse = await fetch(
    `https://${shopDomain}/admin/api/2024-01/orders/${orderId}/fulfillment_orders.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    }
  );

  if (!fulfillmentOrdersResponse.ok) {
    const err = await fulfillmentOrdersResponse.text();
    console.error("Failed to get fulfillment orders:", err);
    return { ok: false, error: `Failed to get fulfillment orders: ${err}` };
  }

  const fulfillmentOrdersData = await fulfillmentOrdersResponse.json();
  const fulfillmentOrders: any[] = fulfillmentOrdersData.fulfillment_orders || [];

  // Prefer fulfillment orders with fulfillable items
  const pick = fulfillmentOrders.find((fo: any) => {
    const items = fo?.line_items || [];
    return items.some((li: any) => (li?.fulfillable_quantity ?? 0) > 0);
  }) || fulfillmentOrders[0];

  if (!pick) {
    console.error("No fulfillment order found for order:", orderId);
    return { ok: false, error: "No fulfillment order found" };
  }

  // Include explicit line items + quantities when available
  const pickedLineItems = (pick?.line_items || [])
    .filter((li: any) => (li?.fulfillable_quantity ?? 0) > 0)
    .map((li: any) => ({
      id: li.id,
      quantity: li.fulfillable_quantity,
    }));

  // Create fulfillment (for digital products, no tracking needed)
  const fulfillmentPayload = {
    fulfillment: {
      line_items_by_fulfillment_order: [
        {
          fulfillment_order_id: pick.id,
          ...(pickedLineItems.length ? { fulfillment_order_line_items: pickedLineItems } : {}),
        },
      ],
      notify_customer: true,
    },
  };

  const fulfillResponse = await fetch(
    `https://${shopDomain}/admin/api/2024-01/fulfillments.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fulfillmentPayload),
    }
  );

  if (!fulfillResponse.ok) {
    const err = await fulfillResponse.text();
    console.error("Failed to create fulfillment:", err);

    // Shopify sometimes returns "unfulfillable status= closed" when the order is already
    // fulfilled (or its fulfillment orders were closed). In that case, we treat it as OK
    // if Shopify reports the order as fulfilled.
    if (isClosedUnfulfillable(err)) {
      const status = await fetchOrderFulfillmentStatus();
      const fulfillmentsCount = status?.fulfillments_count ?? 0;
      if (status && (status.fulfillment_status === "fulfilled" || fulfillmentsCount > 0)) {
        console.log(
          `Fulfillment order closed but Shopify shows fulfilled (status=${status.fulfillment_status}, fulfillments=${fulfillmentsCount}). Treating as fulfilled.`
        );
        return { ok: true };
      }
    }

    return { ok: false, error: `Failed to create fulfillment: ${err}` };
  }

  return { ok: true };
}

async function ensureShopifySaleTransaction(
  supabase: any,
  userId: string,
  order: ShopifyOrder
): Promise<string | null> {
  try {
    const externalId = String(order.id);
    const orderId = String(order.id);
    const firstItem = order.line_items?.[0];
    const quantity = (order.line_items || []).reduce((sum, li) => sum + (li.quantity || 0), 0) || 1;
    const gross = Number.parseFloat(order.total_price || "0") || 0;

    const payload = {
      user_id: userId,
      external_id: externalId,
      date: order.created_at,
      type: "sale",
      order_id: orderId,
      item_title: firstItem?.title || order.name || "Shopify sale",
      sku: firstItem?.sku || null,
      quantity,
      gross,
      fees: 0,
      shipping_charged: 0,
      shipping_cost: 0,
      tax_collected: 0,
      refunds: 0,
      net: gross,
      currency: order.currency || "USD",
      buyer_country: null,
      category: "Uncategorized",
      status: "unmatched",
      raw_data: order,
    };

    const { data, error } = await supabase
      .from("transactions")
      .upsert(payload, { onConflict: "user_id,external_id" })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to upsert Shopify transaction:", error);
      return null;
    }

    return data?.id ?? null;
  } catch (e) {
    console.error("ensureShopifySaleTransaction error:", e);
    return null;
  }
}

async function addOrderNote(
  shopDomain: string,
  accessToken: string,
  orderId: number,
  note: string
): Promise<boolean> {
  console.log(`Adding note to Shopify order ${orderId}`);
  
  const response = await fetch(
    `https://${shopDomain}/admin/api/2024-01/orders/${orderId}.json`,
    {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order: {
          id: orderId,
          note: note,
        },
      }),
    }
  );

  if (!response.ok) {
    console.error("Failed to add order note:", await response.text());
    return false;
  }

  return true;
}

async function processShopifyOrder(
  supabase: any,
  shopDomain: string,
  accessToken: string,
  order: ShopifyOrder,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const orderId = String(order.id);
  const orderName = order.name;
  const buyerEmail = order.email;
  const customerName = order.customer
    ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
    : "";

  // Prefer billing address for invoices, fallback to shipping
  const billing = formatShopifyAddress(order.billing_address || null);
  const shipping = formatShopifyAddress(order.shipping_address || null);
  const buyerName = (billing.name || shipping.name || customerName || "Unknown").trim();
  const buyerAddressOverride = (billing.address || shipping.address || "").trim();

  console.log(`Processing Shopify order ${orderName} for buyer ${buyerName}`);

  // Atomic idempotency claim: try to INSERT a "processing" row.
  // If it conflicts (unique on order_id+user_id), another process already claimed this order.
  const { data: claimed, error: claimErr } = await supabase
    .from("fulfillment_log")
    .insert({
      user_id: userId,
      order_id: orderId,
      status: "processing",
      platform: "shopify",
      buyer_username: buyerName,
      buyer_email: buyerEmail,
    })
    .select()
    .single();

  if (claimErr) {
    // Conflict means another process already has this order
    if (claimErr.code === "23505") {
      // Check existing row state
      const { data: existingLog } = await supabase
        .from("fulfillment_log")
        .select("*")
        .eq("order_id", orderId)
        .eq("user_id", userId)
        .single();

      if (existingLog?.message_sent) {
        if (existingLog.marked_fulfilled) {
          console.log(`Order ${orderId} already processed (keys sent + fulfilled), skipping`);
          return { success: true };
        }

        console.log(`Order ${orderId} already has keys sent; retrying Shopify fulfillment only`);
        const fulfillResult = await fulfillShopifyOrder(shopDomain, accessToken, order.id);

        await supabase
          .from("fulfillment_log")
          .update({
            marked_fulfilled: fulfillResult.ok,
            status: fulfillResult.ok ? "success" : (existingLog.status || "partial"),
            message_error: fulfillResult.ok ? null : (fulfillResult.error || null),
            error_message: fulfillResult.ok ? null : (fulfillResult.error || null),
          })
          .eq("id", existingLog.id);

        return { success: true };
      }

      // Still "processing" — another instance is actively handling it, skip
      // unless the claim is stale (>5 min), in which case treat as abandoned and re-evaluate
      if (existingLog?.status === "processing") {
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
          return { success: true };
        }
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
        return { success: true };
      }
    } else {
      console.error(`Failed to claim order ${orderId}:`, claimErr);
      return { success: false, error: claimErr.message };
    }
  } else {
    console.log(`Claimed order ${orderId} for processing`);
  }

  type PlannedDelivery = {
    platformListingId: string;
    itemTitle: string;
    inventoryItemId: string;
    inventoryItem: any;
    quantity: number;
    keys: any[];
  };

  const planned: PlannedDelivery[] = [];
  const allKeyIds: string[] = [];
  const sections: string[] = [];

  // 1) Plan + allocate keys for all line items first (fail whole order if any item is missing keys)
  for (const lineItem of order.line_items || []) {
    const productId = String(lineItem.product_id);
    const variantId = String(lineItem.variant_id);
    const itemTitle = lineItem.title;
    const sku = lineItem.sku;
    const quantity = Math.max(1, Number(lineItem.quantity) || 1);

    console.log(`Planning line item: ${itemTitle} (Product: ${productId}, Variant: ${variantId}, SKU: ${sku}, qty=${quantity})`);

    let platformListing: any = null;

    const combinedId = `${productId}_${variantId}`;
    const { data: listingByCombined } = await supabase
      .from("platform_listings")
      .select("*, inventory_items(*)")
      .eq("user_id", userId)
      .eq("platform", "shopify")
      .eq("platform_listing_id", combinedId)
      .single();
    if (listingByCombined) platformListing = listingByCombined;

    if (!platformListing) {
      const { data: listingByVariant } = await supabase
        .from("platform_listings")
        .select("*, inventory_items(*)")
        .eq("user_id", userId)
        .eq("platform", "shopify")
        .eq("platform_listing_id", variantId)
        .single();
      if (listingByVariant) platformListing = listingByVariant;
    }

    if (!platformListing) {
      const { data: listingByProduct } = await supabase
        .from("platform_listings")
        .select("*, inventory_items(*)")
        .eq("user_id", userId)
        .eq("platform", "shopify")
        .eq("platform_listing_id", productId)
        .single();
      if (listingByProduct) platformListing = listingByProduct;
    }

    if (!platformListing && sku) {
      const { data: listingBySku } = await supabase
        .from("platform_listings")
        .select("*, inventory_items(*)")
        .eq("user_id", userId)
        .eq("platform", "shopify")
        .ilike("sku", sku)
        .single();
      if (listingBySku) platformListing = listingBySku;
    }

    if (!platformListing?.inventory_item_id) {
      console.log(`Listing not linked to any inventory item for Shopify item ${productId}, skipping`);
      continue;
    }

    const inventoryItemId = platformListing.inventory_item_id as string;
    const inventoryItem = platformListing.inventory_items;

    if (inventoryItem?.auto_delivery_enabled === false) {
      console.log(`Auto-delivery disabled for inventory item ${inventoryItemId}, skipping item`);
      continue;
    }

    const { data: availableKeys } = await supabase
      .from("digital_keys")
      .select("*")
      .eq("user_id", userId)
      .eq("inventory_item_id", inventoryItemId)
      .eq("status", "available")
      .order("created_at", { ascending: true })
      .limit(quantity);

    if (!availableKeys || availableKeys.length < quantity) {
      const errorMsg = `Need ${quantity} key(s) for '${itemTitle}' but only ${availableKeys?.length || 0} available`;
      console.log(errorMsg);

      await supabase.from("fulfillment_log").upsert({
        user_id: userId,
        order_id: orderId,
        listing_id: productId,
        item_title: itemTitle,
        buyer_username: buyerName,
        buyer_email: buyerEmail,
        status: "failed",
        error_message: errorMsg,
        platform: "shopify",
        inventory_item_id: inventoryItemId,
      }, { onConflict: "order_id,user_id" });

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
              order_id: orderName,
              item_title: itemTitle,
              buyer_username: buyerName,
              error_message: errorMsg,
              platform: "shopify",
            },
          }),
        });
      } catch (e) {
        console.error("Telegram notification error:", e);
      }

      return { success: false, error: errorMsg };
    }

    planned.push({
      platformListingId: productId,
      itemTitle,
      inventoryItemId,
      inventoryItem,
      quantity,
      keys: availableKeys,
    });

    for (const k of availableKeys) allKeyIds.push(k.id);
  }

  if (!planned.length) {
    // Nothing to fulfill (e.g. everything skipped due to auto_delivery disabled)
    return { success: true };
  }

  // 2) Build ONE email containing all keys (per your preference)
  // If there is a single inventory item with a custom template, reuse it.
  let messageBody = "";
  const uniqueInventoryItems = Array.from(new Set(planned.map((p) => p.inventoryItemId)));

  if (uniqueInventoryItems.length === 1) {
    const only = planned[0];
    const allKeys = planned.flatMap((p) => p.keys).map((k: any) => k.digital_key);
    const downloadUrl = only.inventoryItem?.download_url || planned.flatMap((p) => p.keys)[0]?.download_url || "";
    const template = only.inventoryItem?.delivery_message ||
      `Thank you for your purchase!\n\nHere is your product key:\n{KEY}\n\nDownload link:\n{DOWNLOAD_URL}\n\nBest regards`;
    messageBody = template
      .replace(/{KEY}/g, allKeys.join("\n"))
      .replace(/{DOWNLOAD_URL}/g, downloadUrl);
  } else {
    for (const p of planned) {
      const keyText = (p.keys || []).map((k: any) => k.digital_key).join("\n");
      const downloadUrl = p.inventoryItem?.download_url || p.keys?.[0]?.download_url || "";
      sections.push(
        `Item: ${p.itemTitle}\nQuantity: ${p.quantity}\n\nKeys:\n${keyText}${downloadUrl ? `\n\nDownload:\n${downloadUrl}` : ""}`
      );
    }
    messageBody =
      `Thank you for your purchase!\n\nOrder: ${orderName}\n\n` +
      sections.join("\n\n---\n\n") +
      `\n\nIf you have any questions, reply to this email.`;
  }

  if (!buyerEmail) {
    const errorMsg = "Missing buyer email on Shopify order";
    await supabase.from("fulfillment_log").upsert({
      user_id: userId,
      order_id: orderId,
      listing_id: planned[0]?.platformListingId,
      inventory_item_id: planned[0]?.inventoryItemId,
      item_title: planned[0]?.itemTitle,
      buyer_username: buyerName,
      buyer_email: null,
      status: "failed",
      error_message: errorMsg,
      platform: "shopify",
      message_sent: false,
      message_error: errorMsg,
      message_body: messageBody,
      marked_fulfilled: false,
    }, { onConflict: "order_id,user_id" });
    return { success: false, error: errorMsg };
  }

  console.log(`Prepared single message for ${allKeyIds.length} key(s) across ${planned.length} item(s)`);

  const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/email-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      userId,
      to: buyerEmail,
      subject: `Your purchase ${orderName}`,
      html: `<pre style="white-space:pre-wrap">${messageBody.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`,
      text: messageBody,
    }),
  }).then((r) => r.json().catch(() => ({})));

  if (!emailRes?.success) {
    const err = emailRes?.error || "Failed to send delivery email";
    await supabase.from("fulfillment_log").upsert({
      user_id: userId,
      order_id: orderId,
      listing_id: planned[0]?.platformListingId,
      inventory_item_id: planned[0]?.inventoryItemId,
      item_title: planned[0]?.itemTitle,
      buyer_username: buyerName,
      buyer_email: buyerEmail,
      status: "failed",
      error_message: err,
      platform: "shopify",
      message_sent: false,
      message_error: err,
      message_body: messageBody,
      marked_fulfilled: false,
    }, { onConflict: "order_id,user_id" });
    return { success: false, error: err };
  }

  // 3) Mark keys as used (only after email success)
  await supabase
    .from("digital_keys")
    .update({
      status: "used",
      used_at: new Date().toISOString(),
      order_id: orderId,
      platform: "shopify",
    })
    .in("id", allKeyIds);

  // 4) Mark order as fulfilled on Shopify (after ALL keys were sent)
  const fulfillResult = await fulfillShopifyOrder(shopDomain, accessToken, order.id);
  if (!fulfillResult.ok) {
    console.log("Warning: Failed to mark order as fulfilled on Shopify:", fulfillResult.error);
  }

  // 5) Stock sync: update quantity on other linked platforms
  for (const p of planned) {
    if (p.inventoryItemId) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/stock-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            userId,
            inventoryItemId: p.inventoryItemId,
            soldQuantity: p.quantity,
            sourcePlatform: "shopify",
          }),
        });
        console.log(`Stock sync triggered for inventory ${p.inventoryItemId} (sold ${p.quantity} on Shopify)`);
      } catch (syncErr) {
        console.error("Stock sync error (non-fatal):", syncErr);
      }
    }
  }

  // Ensure a transaction exists so invoice generation can work
  const transactionId = await ensureShopifySaleTransaction(supabase, userId, order);

  // Check if auto_send_invoice is enabled for this user
  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("auto_send_invoice")
    .eq("user_id", userId)
    .maybeSingle();
  
  const autoSendInvoice = userSettings?.auto_send_invoice !== false; // default true

  // Try to send invoice email (best-effort) - only if auto_send_invoice is enabled
  let invoiceSent = false;
  let invoiceError: string | null = null;
  if (!autoSendInvoice) {
    console.log(`Invoice auto-send disabled for user ${userId}, skipping invoice`);
    invoiceError = "disabled"; // Convention: "disabled" means intentionally skipped
  } else if (transactionId) {
    const invRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        transactionId,
        buyerEmail,
        sendEmail: true,
        buyerName,
        buyerAddressOverride,
        userId,
      }),
    }).then((r) => r.json().catch(() => ({})));

    invoiceSent = Boolean(invRes?.emailSent);
    if (!invoiceSent) invoiceError = invRes?.emailError || invRes?.error || "Invoice send failed";
  } else {
    invoiceError = "Missing transaction for order; cannot generate invoice";
  }

  if (!invoiceSent && invoiceError && invoiceError !== "disabled") {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          type: "invoice_failed",
          data: {
            order_id: orderName,
            item_title: planned[0]?.itemTitle,
            buyer_username: buyerName,
            error_message: invoiceError,
          },
        }),
      });
    } catch (e) {
      console.error("Telegram invoice_failed notification error:", e);
    }
  }

  // Log outcome
  await supabase.from("fulfillment_log").upsert({
    user_id: userId,
    order_id: orderId,
    listing_id: planned[0]?.platformListingId,
    inventory_item_id: planned[0]?.inventoryItemId,
    item_title: planned.length === 1 ? planned[0]?.itemTitle : `${planned.length} items`,
    buyer_username: buyerName,
    buyer_email: buyerEmail,
    status: fulfillResult.ok ? "success" : "partial",
    message_sent: true,
    message_body: messageBody,
    marked_fulfilled: fulfillResult.ok,
    platform: "shopify",
    invoice_sent: invoiceSent,
    invoice_error: invoiceError,
    message_error: fulfillResult.ok ? null : (fulfillResult.error || null),
    error_message: fulfillResult.ok ? null : (fulfillResult.error || null),
  }, { onConflict: "order_id,user_id" });

  console.log(`Shopify order ${orderName}: keysSent=${allKeyIds.length}, fulfilled=${fulfillResult.ok}`);
  return { success: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization");
    let targetUserId: string | null = null;

    // Parse body for manual fulfillment
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body or invalid JSON
    }

    const specificOrderId = body?.orderId;
    const forceManualFulfill = body?.forceManual === true;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        targetUserId = user.id;
      }
    }

    // Get all users with Shopify connected
    let credQuery = supabase
      .from("user_shopify_credentials")
      .select("user_id, shop_domain, access_token")
      .not("access_token", "is", null);

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
        // Check auto_delivery_enabled from user_settings
        if (!forceManualFulfill) {
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

        // Fetch unfulfilled orders
        const orders = await fetchShopifyOrders(creds.shop_domain, creds.access_token);

        let ordersProcessed = 0;
        for (const order of orders) {
          // If specific order requested, only process that one
          if (specificOrderId && String(order.id) !== String(specificOrderId)) {
            continue;
          }

          const result = await processShopifyOrder(
            supabase,
            creds.shop_domain,
            creds.access_token,
            order,
            creds.user_id
          );

          if (result.success) {
            ordersProcessed++;
          }
        }

        results.push({
          userId: creds.user_id,
          ordersProcessed,
          platform: "shopify",
        });
      } catch (userError: unknown) {
        console.error(`Error processing Shopify for user ${creds.user_id}:`, userError);
        results.push({
          userId: creds.user_id,
          error: userError instanceof Error ? userError.message : String(userError),
          platform: "shopify",
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Shopify auto-fulfill error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
