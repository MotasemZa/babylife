import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

async function fetchShopifyOrders(
  shopDomain: string,
  accessToken: string,
  status: string = "unfulfilled"
): Promise<ShopifyOrder[]> {
  const response = await fetch(
    `https://${shopDomain}/admin/api/2024-01/orders.json?fulfillment_status=${status}&financial_status=paid&limit=50`,
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
  return data.orders || [];
}

async function fulfillOrder(
  shopDomain: string,
  accessToken: string,
  orderId: number,
  lineItemIds: number[],
  trackingInfo?: { company?: string; number?: string; url?: string }
): Promise<boolean> {
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
    console.error("Failed to get fulfillment orders:", await fulfillmentOrdersResponse.text());
    return false;
  }

  const fulfillmentOrdersData = await fulfillmentOrdersResponse.json();
  const fulfillmentOrder = fulfillmentOrdersData.fulfillment_orders?.[0];

  if (!fulfillmentOrder) {
    console.error("No fulfillment order found for order:", orderId);
    return false;
  }

  // Create fulfillment
  const fulfillmentPayload: any = {
    fulfillment: {
      line_items_by_fulfillment_order: [
        {
          fulfillment_order_id: fulfillmentOrder.id,
        },
      ],
      notify_customer: true,
      tracking_info: trackingInfo || undefined,
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
    console.error("Failed to create fulfillment:", await fulfillResponse.text());
    return false;
  }

  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Shopify credentials
    const { data: credentials, error: credError } = await supabase
      .from("user_shopify_credentials")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (credError || !credentials) {
      return new Response(
        JSON.stringify({ error: "Shopify not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "fetch";

    switch (action) {
      case "fetch": {
        // Fetch unfulfilled paid orders
        const orders = await fetchShopifyOrders(
          credentials.shop_domain,
          credentials.access_token,
          "unfulfilled"
        );

        return new Response(
          JSON.stringify({ success: true, orders }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fulfill": {
        const { orderId, lineItemIds, digitalKey, downloadUrl } = body;

        if (!orderId) {
          return new Response(
            JSON.stringify({ error: "Order ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // For digital products, we fulfill without tracking
        const fulfilled = await fulfillOrder(
          credentials.shop_domain,
          credentials.access_token,
          orderId,
          lineItemIds || []
        );

        if (!fulfilled) {
          return new Response(
            JSON.stringify({ error: "Failed to fulfill order" }),
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
    console.error("Shopify fetch orders error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
