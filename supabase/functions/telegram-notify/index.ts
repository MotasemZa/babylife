import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  user_id: string;
  type:
    | "fulfillment_success"
    | "fulfillment_failed"
    | "out_of_stock"
    | "daily_summary"
    | "invoice_failed";
  data: {
    order_id?: string;
    item_title?: string;
    buyer_username?: string;
    listing_id?: string;
    error_message?: string;
    invoice_number?: string;
    summary?: {
      orders_fulfilled: number;
      orders_failed: number;
      revenue: number;
    };
  };
}

async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  
  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );

    const result = await response.json();
    
    if (!result.ok) {
      console.error("Telegram API error:", result);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
    return false;
  }
}

function formatNotificationMessage(type: string, data: NotificationRequest["data"]): string {
  switch (type) {
    case "fulfillment_success":
      return `✅ <b>Order Fulfilled</b>\n\n` +
        `Order: <code>${data.order_id}</code>\n` +
        `Item: ${data.item_title || "Unknown"}\n` +
        `Buyer: ${data.buyer_username || "Unknown"}\n\n` +
        `Digital key sent successfully!`;

    case "fulfillment_failed":
      return `❌ <b>Fulfillment Failed</b>\n\n` +
        `Order: <code>${data.order_id}</code>\n` +
        `Item: ${data.item_title || "Unknown"}\n` +
        `Buyer: ${data.buyer_username || "Unknown"}\n\n` +
        `<b>Error:</b> ${data.error_message || "No digital key available"}\n\n` +
        `⚠️ Action required: Add keys to continue fulfillment.`;

    case "out_of_stock":
      return `⚠️ <b>Out of Stock Alert</b>\n\n` +
        `Listing: ${data.item_title || "Unknown"}\n` +
        `ID: <code>${data.listing_id}</code>\n\n` +
        `This listing has run out of digital keys. Add more keys to resume auto-fulfillment.`;

    case "daily_summary":
      const summary = data.summary || { orders_fulfilled: 0, orders_failed: 0, revenue: 0 };
      return `📊 <b>Daily Summary</b>\n\n` +
        `✅ Orders Fulfilled: ${summary.orders_fulfilled}\n` +
        `❌ Orders Failed: ${summary.orders_failed}\n` +
        `💰 Revenue: €${summary.revenue.toFixed(2)}\n\n` +
        `Keep up the great work!`;

    case "invoice_failed":
      return `🧾❌ <b>Invoice Email Failed</b>\n\n` +
        `Order: <code>${data.order_id || "Unknown"}</code>\n` +
        (data.invoice_number ? `Invoice: <code>${data.invoice_number}</code>\n` : "") +
        (data.buyer_username ? `Buyer: ${data.buyer_username}\n` : "") +
        (data.item_title ? `Item: ${data.item_title}\n\n` : "\n") +
        `<b>Error:</b> ${data.error_message || "Unknown error"}\n\n` +
        `⚠️ Action: Check SMTP settings / retry invoice.`;

    default:
      return `📬 <b>Notification</b>\n\n${JSON.stringify(data)}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { user_id, type, data }: NotificationRequest = await req.json();

    if (!user_id || !type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_id and type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's notification settings
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("notification_settings")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (settingsError || !settings) {
      console.log("No notification settings found for user:", user_id);
      return new Response(
        JSON.stringify({ success: false, reason: "No notification settings configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if Telegram is enabled
    if (!settings.telegram_enabled || !settings.telegram_chat_id) {
      console.log("Telegram notifications not enabled for user:", user_id);
      return new Response(
        JSON.stringify({ success: false, reason: "Telegram notifications not enabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check notification type preferences
    const shouldNotify = {
      fulfillment_success: settings.notify_fulfillment_success,
      fulfillment_failed: settings.notify_fulfillment_failed,
      out_of_stock: settings.notify_out_of_stock,
      daily_summary: settings.notify_daily_summary,
      invoice_failed: settings.notify_invoice_failed,
    }[type];

    if (!shouldNotify) {
      console.log(`Notification type ${type} is disabled for user:`, user_id);
      return new Response(
        JSON.stringify({ success: false, reason: `Notification type ${type} is disabled` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format and send the message
    const message = formatNotificationMessage(type, data);
    const sent = await sendTelegramMessage(settings.telegram_chat_id, message);

    return new Response(
      JSON.stringify({ success: sent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in telegram-notify:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
