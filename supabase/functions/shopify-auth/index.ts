import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SHOPIFY_CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "";
const SHOPIFY_CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Scopes needed for order fulfillment + cross-listing
const SHOPIFY_SCOPES = [
  "read_orders",
  "write_orders",
  "write_webhooks",
  "read_fulfillments",
  "write_fulfillments",
  "read_products",
  "write_products",
  "read_customers",
].join(",");

async function ensurePaidOrderWebhook(shopDomain: string, accessToken: string) {
  // Registers (or keeps) a webhook that fires as soon as an order is paid.
  // Note: If the user connected previously without the write_webhooks scope,
  // this will fail until they reconnect Shopify.
  const address = `${SUPABASE_URL}/functions/v1/shopify-webhook`;
  const payload = {
    webhook: {
      topic: "orders/paid",
      address,
      format: "json",
    },
  };

  try {
    const resp = await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (resp.ok) return;

    // If it's already registered Shopify may return 422.
    // We'll treat that as non-fatal.
    const txt = await resp.text();
    console.warn("Webhook registration response:", resp.status, txt);
  } catch (e) {
    console.warn("Webhook registration failed:", e);
  }
}

async function ensurePaidOrderWebhookOrExplain(shopDomain: string, accessToken: string) {
  // Same as ensurePaidOrderWebhook, but returns a structured result so the UI can
  // tell the user to reconnect Shopify if scopes are missing.
  const address = `${SUPABASE_URL}/functions/v1/shopify-webhook`;
  const payload = {
    webhook: {
      topic: "orders/paid",
      address,
      format: "json",
    },
  };

  try {
    const resp = await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      return { ok: true as const };
    }

    const txt = await resp.text();
    // Typical cases:
    // - 401/403: missing scope or invalid token
    // - 422: already exists
    if (resp.status === 422) {
      return { ok: true as const, note: "already_exists" as const };
    }

    return {
      ok: false as const,
      status: resp.status,
      body: txt,
      needsReconnect:
        resp.status === 401 ||
        resp.status === 403 ||
        (txt || "").toLowerCase().includes("scope") ||
        (txt || "").toLowerCase().includes("access denied"),
    };
  } catch (e) {
    return { ok: false as const, status: 0, body: String(e), needsReconnect: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    // Detect callback by presence of Shopify's code parameter (no query param for action)
    const isCallback = url.searchParams.has("code") && url.searchParams.has("shop");
    const action = isCallback ? "callback" : url.searchParams.get("action");
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get authenticated user (not needed for callback - state contains userId)
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    switch (action) {
      case "get-auth-url": {
        // Get shop domain from request
        const body = await req.json();
        const shopDomain = body.shopDomain?.replace("https://", "").replace("http://", "").replace(/\/$/, "");
        
        if (!shopDomain) {
          return new Response(
            JSON.stringify({ error: "Shop domain is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate shop domain format
        if (!shopDomain.endsWith(".myshopify.com")) {
          return new Response(
            JSON.stringify({ error: "Invalid shop domain. Must be yourstore.myshopify.com" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Redirect URI without query params - Shopify doesn't allow them
        const redirectUri = `${SUPABASE_URL}/functions/v1/shopify-auth`;
        const state = btoa(JSON.stringify({ userId, shopDomain }));
        
        const authUrl = `https://${shopDomain}/admin/oauth/authorize?` +
          `client_id=${SHOPIFY_CLIENT_ID}` +
          `&scope=${SHOPIFY_SCOPES}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&state=${state}`;

        return new Response(
          JSON.stringify({ authUrl }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "callback": {
        // OAuth callback from Shopify
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const shop = url.searchParams.get("shop");
        
        if (!code || !shop) {
          return new Response("Missing required parameters", { status: 400 });
        }

        let stateData: { userId: string; shopDomain: string };
        try {
          stateData = JSON.parse(atob(state || ""));
        } catch {
          return new Response("Invalid state parameter", { status: 400 });
        }
        
        if (!stateData?.userId) {
          return new Response("Invalid state: missing userId", { status: 400 });
        }

        // Exchange code for access token
        const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: SHOPIFY_CLIENT_ID,
            client_secret: SHOPIFY_CLIENT_SECRET,
            code,
          }),
        });

        if (!tokenResponse.ok) {
          console.error("Failed to exchange code:", await tokenResponse.text());
          return new Response("Failed to get access token", { status: 500 });
        }

        const tokenData = await tokenResponse.json();

        // Store credentials
        const { error: upsertError } = await supabase
          .from("user_shopify_credentials")
          .upsert({
            user_id: stateData.userId,
            shop_domain: shop,
            access_token: tokenData.access_token,
            scope: tokenData.scope,
          }, { onConflict: "user_id" });

        if (upsertError) {
          console.error("Failed to store credentials:", upsertError);
          return new Response("Failed to store credentials", { status: 500 });
        }

        // Best-effort webhook registration for instant fulfillment.
        // (If scope is missing, user will need to reconnect.)
        await ensurePaidOrderWebhook(shop, tokenData.access_token);

        // Redirect back to the app
        const appUrl = Deno.env.get("APP_URL") || "https://ebay-tax-buddy.lovable.app";
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${appUrl}/app/imports?shopify=connected`,
          },
        });
      }

      case "check-status": {
        if (!userId) {
          return new Response(
            JSON.stringify({ connected: false, error: "Not authenticated" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: allCredentials, error } = await supabase
          .from("user_shopify_credentials")
          .select("id, shop_domain, scope, created_at, label")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });

        if (error || !allCredentials || allCredentials.length === 0) {
          return new Response(
            JSON.stringify({ connected: false, stores: [] }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            connected: true,
            // Keep backwards compat with single-store consumers
            shopDomain: allCredentials[0].shop_domain,
            scope: allCredentials[0].scope,
            connectedAt: allCredentials[0].created_at,
            // New multi-store payload
            stores: allCredentials.map((c: any) => ({
              id: c.id,
              shopDomain: c.shop_domain,
              scope: c.scope,
              connectedAt: c.created_at,
              label: c.label,
            })),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "install-webhook": {
        if (!userId) {
          return new Response(
            JSON.stringify({ success: false, error: "Not authenticated" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: credentials, error } = await supabase
          .from("user_shopify_credentials")
          .select("shop_domain, access_token, scope")
          .eq("user_id", userId)
          .single();

        if (error || !credentials?.shop_domain || !credentials?.access_token) {
          return new Response(
            JSON.stringify({ success: false, error: "Shopify not connected" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const result = await ensurePaidOrderWebhookOrExplain(
          credentials.shop_domain,
          credentials.access_token
        );

        return new Response(
          JSON.stringify({
            success: result.ok,
            needsReconnect: !result.ok ? result.needsReconnect : false,
            status: !result.ok ? result.status : undefined,
            details: !result.ok ? result.body : result.note,
            scope: credentials.scope,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "disconnect": {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: "Not authenticated" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Support disconnecting a specific store by credential ID
        let bodyData: any = {};
        try { bodyData = await req.json(); } catch {}
        const credentialId = bodyData?.credentialId;

        let query = supabase
          .from("user_shopify_credentials")
          .delete()
          .eq("user_id", userId);

        if (credentialId) {
          query = query.eq("id", credentialId);
        }

        const { error } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ error: "Failed to disconnect" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    console.error("Shopify auth error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
