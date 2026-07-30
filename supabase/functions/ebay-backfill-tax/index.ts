import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function extractEbayCollectedTaxFromOrder(raw: unknown): number {
  if (!raw) return 0;

  let order: any = raw;
  if (typeof raw === "string") {
    try {
      order = JSON.parse(raw);
    } catch {
      return 0;
    }
  }

  const lineItems: any[] = Array.isArray(order?.lineItems) ? order.lineItems : [];
  let total = 0;

  for (const item of lineItems) {
    const taxes: any[] = Array.isArray(item?.ebayCollectAndRemitTaxes) ? item.ebayCollectAndRemitTaxes : [];
    for (const t of taxes) {
      total += safeNumber(t?.amount?.value);
    }
  }

  return total;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Tax backfill started for user ${user.id}`);

    const pageSize = 500;
    let from = 0;
    let updated = 0;
    let scanned = 0;

    while (true) {
      const { data: rows, error } = await supabaseAdmin
        .from("transactions")
        .select("id, raw_data, tax_collected")
        .eq("user_id", user.id)
        .eq("type", "sale")
        .or("tax_collected.is.null,tax_collected.eq.0")
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("Tax backfill select error:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        scanned += 1;
        const tax = extractEbayCollectedTaxFromOrder((row as any).raw_data);
        if (tax <= 0) continue;

        const { error: updateError } = await supabaseAdmin
          .from("transactions")
          .update({ tax_collected: tax })
          .eq("id", (row as any).id);

        if (updateError) {
          console.error("Tax backfill update error:", updateError);
        } else {
          updated += 1;
        }
      }

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    console.log(`Tax backfill done for user ${user.id}: updated=${updated} scanned=${scanned}`);

    return new Response(JSON.stringify({ success: true, updated, scanned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Tax backfill error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
