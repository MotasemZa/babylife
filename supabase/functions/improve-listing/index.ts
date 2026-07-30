import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL_COSTS: Record<string, number> = {
  'gpt-4o-mini': 1,
  'gpt-4o': 2,
  'gpt-4.1': 3,
  'gpt-5': 5,
};

const MODEL_MAPPING: Record<string, string> = {
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4o': 'gpt-4o',
  'gpt-4.1': 'gpt-4.1-2025-04-14',
  'gpt-5': 'gpt-5-2025-08-07',
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

    // Get user from token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { listings } = await req.json();
    
    if (!listings || !Array.isArray(listings) || listings.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No listings provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user settings (credits and model preference)
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('ai_credits, ai_model')
      .eq('user_id', user.id)
      .single();

    const aiCredits = settings?.ai_credits ?? 10;
    const aiModel = settings?.ai_model ?? 'gpt-4o-mini';
    const costPerListing = MODEL_COSTS[aiModel] || 1;
    const totalCost = listings.length * costPerListing;

    console.log(`User ${user.id}: ${aiCredits} credits, model: ${aiModel}, cost: ${totalCost} for ${listings.length} listings`);

    // Check if user has enough credits
    if (aiCredits < totalCost) {
      return new Response(
        JSON.stringify({ 
          error: `Insufficient credits. You need ${totalCost} credits but have ${aiCredits}. Please purchase more credits in Settings.`,
          creditsNeeded: totalCost,
          creditsAvailable: aiCredits
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const improvedListings = [];
    const openaiModel = MODEL_MAPPING[aiModel] || 'gpt-4o-mini';

    for (const listing of listings) {
      const prompt = `You are an expert eBay listing optimizer. Analyze this listing and provide improvements to increase sales and visibility.

Current Listing:
- Title: ${listing.title || 'Not provided'}
- Description: ${listing.description || 'Not provided'}
- Price: ${listing.price || 'Not provided'}
- Category: ${listing.category || 'Not provided'}
- Condition: ${listing.condition || 'Not provided'}

Provide your response in this exact JSON format:
{
  "improvedTitle": "optimized title with keywords (max 80 chars)",
  "improvedDescription": "enhanced description with bullet points and key features",
  "suggestedKeywords": ["keyword1", "keyword2", "keyword3"],
  "priceSuggestion": "price recommendation or 'keep current'",
  "tips": ["tip1", "tip2", "tip3"]
}

Focus on:
1. SEO-optimized titles with relevant keywords
2. Clear, scannable descriptions
3. Competitive pricing insights
4. Category-specific improvements`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: openaiModel,
          messages: [
            { role: 'system', content: 'You are an expert eBay listing optimizer. Always respond with valid JSON only, no markdown or extra text.' },
            { role: 'user', content: prompt }
          ],
          max_completion_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 401) {
          return new Response(
            JSON.stringify({ error: 'Invalid OpenAI API key. Please check your configuration.' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      console.log('OpenAI response for listing:', listing.title, content.substring(0, 200));

      let suggestions;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('Failed to parse OpenAI response:', parseError);
        suggestions = {
          improvedTitle: listing.title,
          improvedDescription: listing.description,
          suggestedKeywords: [],
          priceSuggestion: 'Unable to analyze',
          tips: ['Could not generate suggestions for this listing']
        };
      }

      improvedListings.push({
        original: listing,
        suggestions
      });
    }

    // Deduct credits after successful processing
    const newCredits = aiCredits - totalCost;
    await supabase
      .from('user_settings')
      .update({ ai_credits: newCredits, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    // Log the credit transaction
    await supabase
      .from('credit_transactions')
      .insert({
        user_id: user.id,
        amount: -totalCost,
        type: 'usage',
        description: `Improved ${listings.length} listing(s) using ${aiModel}`
      });

    console.log(`Successfully processed ${improvedListings.length} listings, deducted ${totalCost} credits`);

    return new Response(
      JSON.stringify({ 
        improvedListings,
        creditsUsed: totalCost,
        creditsRemaining: newCredits
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in improve-listing function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
