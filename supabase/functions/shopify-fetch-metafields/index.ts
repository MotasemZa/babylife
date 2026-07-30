import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { shopifyCredentialId } = await req.json();

    // Get Shopify credentials
    let credsQuery = supabase
      .from("user_shopify_credentials")
      .select("shop_domain, access_token")
      .eq("user_id", user.id);

    if (shopifyCredentialId) {
      credsQuery = credsQuery.eq("id", shopifyCredentialId);
    }

    const { data: creds, error: credError } = await credsQuery.limit(1).single();

    if (credError || !creds?.access_token) {
      return new Response(
        JSON.stringify({ error: "Shopify not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch metafield definitions via GraphQL
    const graphqlQuery = `
      {
        metafieldDefinitions(ownerType: PRODUCT, first: 50) {
          edges {
            node {
              key
              namespace
              name
              description
              type {
                name
              }
            }
          }
        }
      }
    `;

    const graphqlRes = await fetch(
      `https://${creds.shop_domain}/admin/api/2024-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": creds.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: graphqlQuery }),
      }
    );

    if (!graphqlRes.ok) {
      const errText = await graphqlRes.text();
      console.error("Shopify GraphQL error:", graphqlRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Shopify API error: ${graphqlRes.status}` }),
        { status: graphqlRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const graphqlData = await graphqlRes.json();
    const edges = graphqlData?.data?.metafieldDefinitions?.edges || [];

    const definitions = edges.map((edge: any) => ({
      key: edge.node.key,
      namespace: edge.node.namespace,
      name: edge.node.name,
      description: edge.node.description || "",
      type: edge.node.type?.name || "single_line_text_field",
    }));

    return new Response(
      JSON.stringify({ success: true, definitions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in shopify-fetch-metafields:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
