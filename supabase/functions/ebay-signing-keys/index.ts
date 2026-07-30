import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EBAY_CLIENT_ID = Deno.env.get('EBAY_CLIENT_ID')!;
const EBAY_CLIENT_SECRET = Deno.env.get('EBAY_CLIENT_SECRET')!;

// eBay Key Management API endpoint
const EBAY_KEY_MANAGEMENT_API = 'https://apiz.ebay.com/developer/key_management/v1/signing_key';

// Helper function to refresh expired eBay access token
async function refreshAccessToken(
  supabase: any,
  userId: string,
  refreshToken: string
): Promise<string | null> {
  console.log('Attempting to refresh eBay access token...');
  
  const authString = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
  
  try {
    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authString}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to refresh token:', errorText);
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const expiresIn = data.expires_in || 7200;
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Update the token in the secure credentials table
    const { error: updateError } = await supabase
      .from('user_ebay_credentials')
      .update({
        ebay_access_token: newAccessToken,
        ebay_token_expires_at: newExpiresAt,
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Failed to update refreshed token:', updateError);
      return null;
    }

    console.log('eBay access token refreshed successfully');
    return newAccessToken;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Not authenticated');
    }

    // Get user from JWT
    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Invalid token');
    }

    const { action } = await req.json();
    console.log(`eBay Signing Keys: Action ${action} for user ${user.id}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user's eBay tokens from secure credentials table
    const { data: credentials, error: credError } = await supabase
      .from('user_ebay_credentials')
      .select('ebay_access_token, ebay_refresh_token, ebay_token_expires_at, ebay_signing_key_jwe, ebay_signing_key_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (credError || !credentials?.ebay_access_token) {
      throw new Error('eBay not connected. Please connect your eBay account first.');
    }

    // Check if token is expired and try to refresh it
    let accessToken = credentials.ebay_access_token;
    if (new Date(credentials.ebay_token_expires_at) < new Date()) {
      console.log('eBay token expired, attempting refresh...');
      
      if (!credentials.ebay_refresh_token) {
        throw new Error('eBay token expired and no refresh token available. Please reconnect your account.');
      }
      
      const newToken = await refreshAccessToken(supabase, user.id, credentials.ebay_refresh_token);
      if (!newToken) {
        throw new Error('Failed to refresh eBay token. Please reconnect your account.');
      }
      accessToken = newToken;
    }

    if (action === 'check') {
      // Check if signing keys already exist
      return new Response(
        JSON.stringify({
          hasSigningKeys: !!credentials.ebay_signing_key_jwe,
          keyId: credentials.ebay_signing_key_id || null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'generate') {
      console.log('Generating eBay signing keys via Key Management API...');

      // First, get an application access token (client credentials grant)
      // The Key Management API requires app-level authentication, not user-level
      const authString = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
      
      const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authString}`,
        },
        body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Failed to get app token:', errorText);
        throw new Error('Failed to obtain eBay application token');
      }

      const tokenData = await tokenResponse.json();
      const appAccessToken = tokenData.access_token;

      // Now call Key Management API to create a signing key
      const keyResponse = await fetch(EBAY_KEY_MANAGEMENT_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${appAccessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          signingKeyCipher: 'ED25519',
        }),
      });

      if (!keyResponse.ok) {
        const errorText = await keyResponse.text();
        console.error('eBay Key Management API Error:', keyResponse.status, errorText);
        
        // Parse error for better message
        try {
          const errorJson = JSON.parse(errorText);
          const errorMsg = errorJson.errors?.[0]?.longMessage || errorJson.errors?.[0]?.message || errorText;
          throw new Error(`eBay Key Management API: ${errorMsg}`);
        } catch {
          throw new Error(`eBay Key Management API Error: ${keyResponse.status}`);
        }
      }

      const keyData = await keyResponse.json();
      console.log('eBay signing key created:', keyData.signingKeyId);

      // The response contains:
      // - signingKeyId: unique identifier
      // - jwe: the encrypted public key to send in x-ebay-signature-key header
      // - privateKey: PEM format private key for signing (IMPORTANT: eBay doesn't store this!)

      // Store the keys in secure credentials table
      const { error: updateError } = await supabase
        .from('user_ebay_credentials')
        .update({
          ebay_signing_key_jwe: keyData.jwe,
          ebay_signing_private_key: keyData.privateKey,
          ebay_signing_key_id: keyData.signingKeyId,
          ebay_signing_key_created_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Failed to store signing keys:', updateError);
        throw new Error('Failed to store signing keys');
      }

      console.log('Signing keys stored successfully for user', user.id);

      return new Response(
        JSON.stringify({
          success: true,
          keyId: keyData.signingKeyId,
          message: 'eBay Digital Signature keys generated successfully. You can now sync Finances and Payouts data.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error: unknown) {
    console.error('eBay Signing Keys Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
