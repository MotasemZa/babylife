import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { title, category, condition, price, imageUrls } = await req.json();

    if (!title) {
      return new Response(
        JSON.stringify({ error: 'Product title is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check credits
    const { data: settings } = await supabase
      .from('user_settings')
      .select('ai_credits')
      .eq('user_id', user.id)
      .single();

    const aiCredits = settings?.ai_credits ?? 0;
    if (aiCredits < 1) {
      return new Response(
        JSON.stringify({ error: 'Insufficient AI credits. Please purchase more in Settings.', creditsAvailable: aiCredits }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: `You are an expert e-commerce copywriter specializing in Shopify product listings. Generate professional, SEO-optimized content. ALWAYS respond with valid JSON only, no markdown or extra text.`
          },
          {
            role: 'user',
            content: `Create a Shopify-optimized product listing from this eBay product:

Title: ${title}
Category: ${category || 'Not specified'}
Condition: ${condition || 'Not specified'}
Price: ${price || 'Not specified'}
Images: ${imageUrls?.length || 0}

Generate:
1. A clean Shopify product description (HTML) — professional, benefit-focused, with bullet points for features
2. SEO tags for Shopify (comma-separated keywords buyers search for)
3. Product type classification for Shopify

Respond in this exact JSON format:
{
  "description": "<p>HTML description here</p>",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "productType": "Category Name"
}`
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limits exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service credits exhausted. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    let suggestions;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch {
      suggestions = {
        description: `<p>${title}</p><p>Quality product available for purchase. Contact seller for details.</p>`,
        tags: [title.split(' ')[0]],
        productType: category || 'Other',
      };
    }

    // Deduct credit
    const newCredits = aiCredits - 1;
    await supabase
      .from('user_settings')
      .update({ ai_credits: newCredits, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    await supabase
      .from('credit_transactions')
      .insert({
        user_id: user.id,
        amount: -1,
        type: 'usage',
        description: 'Cross-list AI fill'
      });

    return new Response(
      JSON.stringify({ suggestions, creditsUsed: 1, creditsRemaining: newCredits }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in crosslist-ai-fill:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
