import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function fbApi(path: string, accessToken: string, method = "GET", body?: any) {
  const url = `https://graph.facebook.com/v25.0/${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (method === "POST" && body) {
    opts.body = JSON.stringify({ ...body, access_token: accessToken });
  } else {
    const separator = url.includes("?") ? "&" : "?";
    const finalUrl = `${url}${separator}access_token=${accessToken}`;
    const res = await fetch(finalUrl, opts);
    return res.json();
  }
  const res = await fetch(url, opts);
  return res.json();
}

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

    const {
      action,
      campaign_id: localCampaignId,
      ad_copy,
      targeting,
      daily_budget,
      start_date,
      end_date,
      campaign_name,
      objective,
      link_url,
      fb_campaign_id: reqFbCampaignId,
      status: reqStatus,
    } = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user's FB credentials
    const { data: fbAccount } = await adminClient
      .from("facebook_ad_accounts")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!fbAccount) {
      return new Response(
        JSON.stringify({ error: "Facebook account not connected. Please connect first." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const accessToken = fbAccount.access_token;
    const adAccountId = fbAccount.ad_account_id;

    // Action: publish — create full campaign + ad set + creative + ad
    if (action === "publish") {
      // 1. Create Campaign
      const campaignRes = await fbApi(`${adAccountId}/campaigns`, accessToken, "POST", {
        name: campaign_name || "Campaign from Platform",
        objective: objective || "LINK_CLICKS",
        status: "PAUSED",
        special_ad_categories: [],
      });

      if (campaignRes.error) {
        return new Response(
          JSON.stringify({ error: `Campaign creation failed: ${campaignRes.error.message}` }),
          { status: 400, headers: corsHeaders }
        );
      }

      const fbCampaignId = campaignRes.id;

      // 2. Create Ad Set
      const budgetCents = Math.round((daily_budget || 5) * 100);
      const adSetBody: any = {
        name: `${campaign_name || "Ad Set"} - Targeting`,
        campaign_id: fbCampaignId,
        daily_budget: budgetCents,
        billing_event: "IMPRESSIONS",
        optimization_goal: "LINK_CLICKS",
        status: "PAUSED",
        targeting: targeting || {
          geo_locations: { countries: ["US"] },
          age_min: 18,
          age_max: 65,
        },
      };

      if (start_date) adSetBody.start_time = new Date(start_date).toISOString();
      if (end_date) adSetBody.end_time = new Date(end_date).toISOString();

      const adSetRes = await fbApi(`${adAccountId}/adsets`, accessToken, "POST", adSetBody);

      if (adSetRes.error) {
        return new Response(
          JSON.stringify({ error: `Ad Set creation failed: ${adSetRes.error.message}` }),
          { status: 400, headers: corsHeaders }
        );
      }

      const fbAdSetId = adSetRes.id;

      // 3. Create Ad Creative
      const creativeBody: any = {
        name: `${campaign_name || "Creative"} - Ad`,
        object_story_spec: {
          page_id: fbAccount.page_id,
          link_data: {
            message: ad_copy?.primary_text || ad_copy?.description || "",
            link: link_url || "https://example.com",
            name: ad_copy?.headline || ad_copy?.headlines?.[0] || campaign_name,
            description: ad_copy?.description || ad_copy?.descriptions?.[0] || "",
            call_to_action: {
              type: ad_copy?.cta === "Shop Now" ? "SHOP_NOW" : "LEARN_MORE",
            },
          },
        },
      };

      const creativeRes = await fbApi(`${adAccountId}/adcreatives`, accessToken, "POST", creativeBody);

      if (creativeRes.error) {
        return new Response(
          JSON.stringify({ error: `Creative creation failed: ${creativeRes.error.message}` }),
          { status: 400, headers: corsHeaders }
        );
      }

      // 4. Create Ad
      const adRes = await fbApi(`${adAccountId}/ads`, accessToken, "POST", {
        name: campaign_name || "Ad",
        adset_id: fbAdSetId,
        creative: { creative_id: creativeRes.id },
        status: "PAUSED",
      });

      if (adRes.error) {
        return new Response(
          JSON.stringify({ error: `Ad creation failed: ${adRes.error.message}` }),
          { status: 400, headers: corsHeaders }
        );
      }

      // 5. Update local campaign record
      if (localCampaignId) {
        await supabase
          .from("marketing_campaigns")
          .update({
            fb_campaign_id: fbCampaignId,
            fb_adset_id: fbAdSetId,
            fb_ad_id: adRes.id,
            fb_status: "PAUSED",
            daily_budget: daily_budget || 5,
            targeting,
            start_date,
            end_date,
          })
          .eq("id", localCampaignId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          fb_campaign_id: fbCampaignId,
          fb_adset_id: fbAdSetId,
          fb_ad_id: adRes.id,
        }),
        { headers: corsHeaders }
      );
    }

    // Action: update_status — pause/resume
    if (action === "update_status") {
      const res = await fbApi(reqFbCampaignId, accessToken, "POST", {
        status: reqStatus, // ACTIVE or PAUSED
      });

      if (res.error) {
        return new Response(
          JSON.stringify({ error: res.error.message }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (localCampaignId) {
        await supabase
          .from("marketing_campaigns")
          .update({ fb_status: reqStatus })
          .eq("id", localCampaignId);
      }

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: corsHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
