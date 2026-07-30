import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function cleanImage(imageUrl: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Clean up this product image: remove any watermarks, text overlays, or logos. Keep the product and background exactly as they are. Return only the cleaned image.' },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        modalities: ['image', 'text'],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Image cleaning failed:', response.status, errText);
      return null;
    }

    const data = await response.json();
    console.log('Clean image response keys:', JSON.stringify(Object.keys(data)));
    const msg = data.choices?.[0]?.message;
    console.log('Message keys:', msg ? JSON.stringify(Object.keys(msg)) : 'no message');
    
    const cleanedUrl = msg?.images?.[0]?.image_url?.url;
    if (!cleanedUrl) {
      console.error('No cleaned image in response. Content:', msg?.content?.substring(0, 200));
    }
    return cleanedUrl || null;
  } catch (error) {
    console.error('Error cleaning image:', error);
    return null;
  }
}

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

    const { title, description, imageUrls, category, condition, price, analyzeImages, fixImages, generateVariation, sourceImageUrl, fixSingleImage, imageUrl, metafieldDefinitions } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Early return branch: fix a single image
    if (fixSingleImage && imageUrl) {
      const cleanedUrl = await cleanImage(imageUrl, LOVABLE_API_KEY);
      if (!cleanedUrl) {
        return new Response(JSON.stringify({ error: 'Failed to clean image' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ cleanedImage: cleanedUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Early return branch: generate image variation
    if (generateVariation && sourceImageUrl) {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3.1-flash-image-preview',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Create a variation of this product photo with a slightly different angle or perspective. Keep the same product, maintain professional quality, white/clean background. Return only the image.' },
                { type: 'image_url', image_url: { url: sourceImageUrl } }
              ]
            }
          ],
          modalities: ['image', 'text'],
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limits exceeded. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: 'AI service credits exhausted.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        throw new Error(`Image variation failed: ${status}`);
      }

      const data = await response.json();
      const variationImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!variationImage) {
        throw new Error('No image returned from AI');
      }

      return new Response(
        JSON.stringify({ variationImage }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (analyzeImages) {
      if (!imageUrls || imageUrls.length === 0) {
        return new Response(
          JSON.stringify({ error: 'At least one image URL is required for AI analysis' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      if (!title) {
        return new Response(
          JSON.stringify({ error: 'Product title is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // LOVABLE_API_KEY already declared above

    // Fix images: clean watermarks if requested
    let processedImageUrls = imageUrls || [];
    const cleanedImages: string[] = [];

    if (fixImages && processedImageUrls.length > 0) {
      console.log(`Cleaning ${processedImageUrls.length} images...`);
      const cleanPromises = processedImageUrls.slice(0, 6).map((url: string) => cleanImage(url, LOVABLE_API_KEY));
      const results = await Promise.all(cleanPromises);
      
      for (let i = 0; i < results.length; i++) {
        if (results[i]) {
          cleanedImages.push(results[i]!);
        }
      }
      
      // Use cleaned images for analysis if we got any
      if (cleanedImages.length > 0) {
        processedImageUrls = cleanedImages;
        console.log(`Successfully cleaned ${cleanedImages.length} images`);
      }
    }

    const systemPrompt = `You are an expert e-commerce listing optimizer with deep knowledge of eBay and Shopify SEO, buyer psychology, and marketplace best practices.

Your task is to analyze product images and/or details and create optimized listing data for multi-platform publishing.

ALWAYS respond with valid JSON only, no markdown or extra text.`;

    // Build user message content
    const userContent: any[] = [];

    if (analyzeImages && processedImageUrls.length > 0) {
      for (const url of processedImageUrls.slice(0, 6)) {
        userContent.push({
          type: 'image_url',
          image_url: { url }
        });
      }
    }

    let textPrompt: string;
    const hasTitle = title && title.trim().length > 0;

    if (analyzeImages) {
      textPrompt = `Analyze the product image(s) above and create a complete, optimized e-commerce listing.

${hasTitle ? `Hint from user - Title: ${title}` : ''}
${description ? `Hint from user - Description: ${description}` : ''}
${category ? `Hint from user - Category: ${category}` : ''}
${condition ? `Hint from user - Condition: ${condition}` : ''}
${price ? `Hint from user - Price: ${price}` : ''}

Based on what you see in the images, generate ALL listing fields:`;
    } else {
      textPrompt = `Analyze this product information and create an optimized listing:

Product Title: ${title}
Description: ${description || 'Not provided'}
Category: ${category || 'Not specified'}
Condition: ${condition || 'Not specified'}
Starting Price: ${price || 'Not specified'}
Number of Images: ${processedImageUrls.length || 0}

Create optimized listing fields:`;
    }

    textPrompt += `

1. SEO-optimized title (max 80 characters) with relevant keywords buyers search for
2. Professional HTML description with:
   - Attention-grabbing opening
   - Key features in bullet points
   - Condition details
   - Call to action
3. Suggested keywords for the listing
4. Price recommendation (USD)
5. Best category suggestion
6. Product condition (one of: New, Used, Refurbished, For parts or not working)
7. Tags for Shopify (5-8 tags)
8. Product type for Shopify
9. Suggested quantity`;

    if (hasTitle) {
      textPrompt += `
10. Generate exactly 5 alternative title variations optimized for different keywords and search patterns. Each should be unique and max 80 characters.`;
    }

    // Add metafield instructions if definitions are provided
    const hasMetafields = metafieldDefinitions && Array.isArray(metafieldDefinitions) && metafieldDefinitions.length > 0;
    if (hasMetafields) {
      const mfList = metafieldDefinitions.map((mf: any) => `- "${mf.name || mf.key}" (namespace: ${mf.namespace}, key: ${mf.key}, type: ${mf.type})`).join('\n');
      textPrompt += `

11. Fill the following Shopify metafields based on the product information. Infer the best values from the product context. If you cannot determine a value, use an empty string.
${mfList}`;
    }

    textPrompt += `

Respond in this exact JSON format:
{
  "improvedTitle": "optimized 80-char max title",
  "titleVariations": ${hasTitle ? '["variation1", "variation2", "variation3", "variation4", "variation5"]' : '[]'},
  "improvedDescription": "full HTML-formatted description",
  "suggestedKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "suggestedPrice": "29.99",
  "suggestedCategory": "category name",
  "condition": "New",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "productType": "Product Type",
  "suggestedQuantity": "1",
  "tips": ["actionable tip 1", "actionable tip 2", "actionable tip 3"]${hasMetafields ? `,
  "metafields": { ${metafieldDefinitions.map((mf: any) => `"${mf.namespace}__${mf.key}": "value"`).join(', ')} }` : ''}
}`;

    userContent.push({ type: 'text', text: textPrompt });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
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
    
    console.log('AI response:', content.substring(0, 500));

    let suggestions;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      suggestions = {
        improvedTitle: title || 'Product Listing',
        titleVariations: [],
        improvedDescription: description || '<p>Contact seller for more details.</p>',
        suggestedKeywords: [],
        suggestedPrice: price || '9.99',
        suggestedCategory: category || 'Other',
        condition: condition || 'New',
        tags: [],
        productType: '',
        suggestedQuantity: '1',
        tips: ['Add more product details', 'Include high-quality images', 'Set competitive pricing']
      };
    }

    // Ensure titleVariations is always an array
    if (!Array.isArray(suggestions.titleVariations)) {
      suggestions.titleVariations = [];
    }

    // Include cleaned images in response if we processed any
    if (cleanedImages.length > 0) {
      suggestions.cleanedImages = cleanedImages;
    }

    console.log(`Generated suggestions for user ${user.id}`);

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-listing-suggestions:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
