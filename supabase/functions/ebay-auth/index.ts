import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EBAY_CLIENT_ID = Deno.env.get('EBAY_CLIENT_ID')!;
const EBAY_CLIENT_SECRET = Deno.env.get('EBAY_CLIENT_SECRET')!;
const EBAY_REDIRECT_URI = Deno.env.get('EBAY_REDIRECT_URI')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// eBay OAuth endpoints
const EBAY_AUTH_URL = 'https://auth.ebay.com/oauth2/authorize';
const EBAY_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';

// Required scopes for reading seller data + inventory management
const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
].join(' ');

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    console.log(`eBay Auth: Action received - ${action}`);

    // Generate OAuth URL for user to authorize
    if (action === 'get-auth-url') {
      const authUrl = `${EBAY_AUTH_URL}?client_id=${encodeURIComponent(EBAY_CLIENT_ID)}&redirect_uri=${encodeURIComponent(EBAY_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(EBAY_SCOPES)}`;
      
      console.log('eBay Auth: Generated auth URL');
      
      return new Response(
        JSON.stringify({ authUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Exchange authorization code for tokens
    if (action === 'exchange-code') {
      const { code, userId } = await req.json();
      
      if (!code || !userId) {
        throw new Error('Missing code or userId');
      }

      console.log(`eBay Auth: Exchanging code for user ${userId}`);

      const credentials = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
      
      const tokenResponse = await fetch(EBAY_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: EBAY_REDIRECT_URI,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (!tokenResponse.ok) {
        console.error('eBay Auth: Token exchange failed', tokenData);
        throw new Error(tokenData.error_description || 'Failed to exchange code');
      }

      console.log('eBay Auth: Token exchange successful');

      // Store tokens in secure credentials table
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
      
      // Store credentials in secure table (only accessible via service_role)
      const { error: credError } = await supabase
        .from('user_ebay_credentials')
        .upsert({
          user_id: userId,
          ebay_access_token: tokenData.access_token,
          ebay_refresh_token: tokenData.refresh_token,
          ebay_token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (credError) {
        console.error('eBay Auth: Failed to store tokens in credentials table', credError);
        throw new Error('Failed to store tokens');
      }

      // Also ensure user_settings row exists (for non-sensitive settings)
      const { error: settingsError } = await supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (settingsError) {
        console.error('eBay Auth: Failed to ensure user_settings exists', settingsError);
        // Non-critical, continue
      }

      console.log('eBay Auth: Tokens stored successfully');

      return new Response(
        JSON.stringify({ success: true, expiresAt: expiresAt.toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh expired token
    if (action === 'refresh-token') {
      const { userId } = await req.json();
      
      if (!userId) {
        throw new Error('Missing userId');
      }

      console.log(`eBay Auth: Refreshing token for user ${userId}`);

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      // Get refresh token from secure credentials table
      const { data: ebayCredentials, error: fetchError } = await supabase
        .from('user_ebay_credentials')
        .select('ebay_refresh_token')
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError || !ebayCredentials?.ebay_refresh_token) {
        throw new Error('No refresh token found');
      }

      const authCredentials = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
      const tokenResponse = await fetch(EBAY_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authCredentials}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: ebayCredentials.ebay_refresh_token,
          scope: EBAY_SCOPES,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (!tokenResponse.ok) {
        console.error('eBay Auth: Token refresh failed', tokenData);
        throw new Error(tokenData.error_description || 'Failed to refresh token');
      }

      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
      
      // Update tokens in secure credentials table
      const { error: updateError } = await supabase
        .from('user_ebay_credentials')
        .update({
          ebay_access_token: tokenData.access_token,
          ebay_token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) {
        throw new Error('Failed to update tokens');
      }

      console.log('eBay Auth: Token refreshed successfully');

      return new Response(
        JSON.stringify({ success: true, expiresAt: expiresAt.toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check connection status
    if (action === 'check-status') {
      const authHeader = req.headers.get('Authorization');
      console.log('check-status: Auth header present?', !!authHeader);
      
      if (!authHeader) {
        console.log('check-status: No auth header, returning not connected');
        return new Response(
          JSON.stringify({ connected: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      // Get user from JWT
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await createClient(
        SUPABASE_URL, 
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      ).auth.getUser();

      console.log('check-status: User from JWT', user?.id, 'Error:', userError?.message);

      if (userError || !user) {
        console.log('check-status: No valid user, returning not connected');
        return new Response(
          JSON.stringify({ connected: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check credentials from secure table
      const { data: credentials, error: credError } = await supabase
        .from('user_ebay_credentials')
        .select('ebay_access_token, ebay_token_expires_at')
        .eq('user_id', user.id)
        .maybeSingle();

      console.log('check-status: Credentials query result', { 
        hasCredentials: !!credentials, 
        hasToken: !!credentials?.ebay_access_token,
        expiresAt: credentials?.ebay_token_expires_at,
        error: credError?.message 
      });

      const connected = !!(credentials?.ebay_access_token);
      const tokenExpired = credentials?.ebay_token_expires_at 
        ? new Date(credentials.ebay_token_expires_at) < new Date()
        : true;

      console.log('check-status: Returning', { connected, tokenExpired });

      return new Response(
        JSON.stringify({ 
          connected, 
          tokenExpired: connected ? tokenExpired : null,
          expiresAt: credentials?.ebay_token_expires_at 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('eBay Auth Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
