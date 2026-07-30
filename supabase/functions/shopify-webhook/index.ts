import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SHOPIFY_CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";

function timingSafeEqual(a: string, b: string) {
  // Simple timing-safe-ish compare for small strings
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function computeShopifyHmacBase64(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const bytes = new Uint8Array(sig);
  // base64
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Shopify does not send our JWT; we must verify via HMAC.
  const shopDomain = req.headers.get("X-Shopify-Shop-Domain") || "";
  const topic = req.headers.get("X-Shopify-Topic") || "";
  const hmacHeader = req.headers.get("X-Shopify-Hmac-Sha256") || "";

  const rawBody = await req.text();

  if (!SHOPIFY_CLIENT_SECRET) {
    console.error("Missing SHOPIFY_CLIENT_SECRET");
    return new Response("Server not configured", { status: 500 });
  }

  if (!hmacHeader) {
    return new Response("Missing HMAC", { status: 401 });
  }

  const computed = await computeShopifyHmacBase64(SHOPIFY_CLIENT_SECRET, rawBody);
  if (!timingSafeEqual(computed, hmacHeader)) {
    console.warn("Shopify webhook HMAC verification failed", { shopDomain, topic });
    return new Response("Invalid signature", { status: 401 });
  }

  console.log("Shopify webhook received", { topic, shopDomain });

  // Only act on paid orders.
  if (topic !== "orders/paid") {
    return new Response("Ignored", { status: 200 });
  }

  let payload: any = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const orderId = payload?.id ? String(payload.id) : null;
  if (!shopDomain || !orderId) {
    return new Response("Missing shop/order", { status: 400 });
  }

  console.log("Shopify webhook validated", { topic, shopDomain, orderId });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find owner user by shop domain.
  const { data: creds, error: credError } = await supabase
    .from("user_shopify_credentials")
    .select("user_id")
    .eq("shop_domain", shopDomain)
    .single();

  if (credError || !creds?.user_id) {
    console.warn("Webhook shop not linked", { shopDomain, credError });
    return new Response("No linked user", { status: 200 });
  }

  // Respect global toggle.
  const { data: settings } = await supabase
    .from("user_settings")
    .select("auto_delivery_enabled")
    .eq("user_id", creds.user_id)
    .single();

  if (settings?.auto_delivery_enabled === false) {
    return new Response("Auto-delivery disabled", { status: 200 });
  }

  // Trigger fulfillment for just this order.
  const triggerRes = await fetch(`${SUPABASE_URL}/functions/v1/shopify-auto-fulfill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Used only for internal trust; function itself also uses service role.
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ orderId }),
  });

  if (!triggerRes.ok) {
    console.error("Failed to trigger shopify-auto-fulfill", await triggerRes.text());
    // Still 200 to prevent Shopify retries storms; safety sweep will catch it.
    return new Response("Triggered (with warnings)", { status: 200 });
  }

  return new Response("OK", { status: 200 });
});
