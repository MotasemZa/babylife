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

    const { action, code, redirect_uri } = await req.json();

    const appId = Deno.env.get("FACEBOOK_APP_ID");
    const appSecret = Deno.env.get("FACEBOOK_APP_SECRET");

    if (!appId || !appSecret) {
      return new Response(
        JSON.stringify({ error: "Facebook app credentials not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Action: get_login_url — return the OAuth URL for the frontend to redirect to
    if (action === "get_login_url") {
      const scopes = "ads_management,ads_read,pages_show_list,pages_read_engagement";
      const loginUrl = `https://www.facebook.com/v25.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${scopes}&response_type=code`;
      return new Response(JSON.stringify({ loginUrl }), { headers: corsHeaders });
    }

    // Action: exchange_code — exchange auth code for access token
    if (action === "exchange_code") {
      // Exchange code for short-lived token
      const tokenUrl = `https://graph.facebook.com/v25.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirect_uri)}&client_secret=${appSecret}&code=${code}`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        return new Response(
          JSON.stringify({ error: tokenData.error.message }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Exchange for long-lived token
      const longLivedUrl = `https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`;
      const longRes = await fetch(longLivedUrl);
      const longData = await longRes.json();

      const accessToken = longData.access_token || tokenData.access_token;
      const expiresIn = longData.expires_in || 5184000; // default 60 days

      // Fetch ad accounts
      const adAccountsRes = await fetch(
        `https://graph.facebook.com/v25.0/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}`
      );
      const adAccountsData = await adAccountsRes.json();

      // Fetch pages
      const pagesRes = await fetch(
        `https://graph.facebook.com/v25.0/me/accounts?fields=id,name&access_token=${accessToken}`
      );
      const pagesData = await pagesRes.json();

      const adAccounts = adAccountsData.data || [];
      const pages = pagesData.data || [];

      if (adAccounts.length === 0) {
        return new Response(
          JSON.stringify({ error: "No ad accounts found. Please create one in Facebook Business Manager." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Store credentials (upsert)
      const { error: upsertError } = await adminClient
        .from("facebook_ad_accounts")
        .upsert(
          {
            user_id: userId,
            access_token: accessToken,
            ad_account_id: adAccounts[0].id,
            account_name: adAccounts[0].name || "Ad Account",
            page_id: pages[0]?.id || null,
            page_name: pages[0]?.name || null,
            token_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (upsertError) {
        return new Response(
          JSON.stringify({ error: upsertError.message }),
          { status: 500, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          ad_account: { id: adAccounts[0].id, name: adAccounts[0].name },
          page: pages[0] ? { id: pages[0].id, name: pages[0].name } : null,
          ad_accounts: adAccounts.map((a: any) => ({ id: a.id, name: a.name })),
          pages: pages.map((p: any) => ({ id: p.id, name: p.name })),
        }),
        { headers: corsHeaders }
      );
    }

    // Action: disconnect
    if (action === "disconnect") {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await adminClient.from("facebook_ad_accounts").delete().eq("user_id", userId);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // Action: status — check if connected
    if (action === "status") {
      const { data } = await supabase
        .from("facebook_ad_accounts")
        .select("ad_account_id, account_name, page_id, page_name, token_expires_at")
        .eq("user_id", userId)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          connected: !!data,
          account: data || null,
        }),
        { headers: corsHeaders }
      );
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
