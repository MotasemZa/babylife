import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const userId = claimsData.claims.sub;

    const { campaign_id } = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get FB credentials
    const { data: fbAccount } = await adminClient
      .from("facebook_ad_accounts")
      .select("access_token")
      .eq("user_id", userId)
      .single();

    if (!fbAccount) {
      return new Response(
        JSON.stringify({ error: "Facebook account not connected" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get the campaign from our DB
    const { data: campaign } = await supabase
      .from("marketing_campaigns")
      .select("fb_campaign_id, fb_adset_id, fb_ad_id")
      .eq("id", campaign_id)
      .eq("user_id", userId)
      .single();

    if (!campaign?.fb_campaign_id) {
      return new Response(
        JSON.stringify({ error: "Campaign not linked to Facebook" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const accessToken = fbAccount.access_token;

    // Fetch campaign insights
    const insightsRes = await fetch(
      `https://graph.facebook.com/v25.0/${campaign.fb_campaign_id}/insights?fields=impressions,clicks,spend,actions&access_token=${accessToken}`
    );
    const insightsData = await insightsRes.json();

    // Fetch campaign status
    const statusRes = await fetch(
      `https://graph.facebook.com/v25.0/${campaign.fb_campaign_id}?fields=status,effective_status&access_token=${accessToken}`
    );
    const statusData = await statusRes.json();

    let clicks = 0;
    let spent = 0;
    let conversions = 0;

    if (insightsData.data && insightsData.data.length > 0) {
      const insight = insightsData.data[0];
      clicks = parseInt(insight.clicks || "0");
      spent = parseFloat(insight.spend || "0");
      const purchaseAction = (insight.actions || []).find(
        (a: any) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
      );
      conversions = purchaseAction ? parseInt(purchaseAction.value || "0") : 0;
    }

    // Update local campaign
    await supabase
      .from("marketing_campaigns")
      .update({
        clicks,
        spent,
        conversions,
        fb_status: statusData.effective_status || statusData.status || "UNKNOWN",
      })
      .eq("id", campaign_id);

    return new Response(
      JSON.stringify({
        success: true,
        metrics: { clicks, spent, conversions },
        status: statusData.effective_status || statusData.status,
      }),
      { headers: corsHeaders }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
