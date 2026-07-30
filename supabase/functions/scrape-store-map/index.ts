const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl is not configured.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Mapping store URL:', formattedUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);

    let response: Response;
    try {
      response = await fetch('https://api.firecrawl.dev/v1/map', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: formattedUrl,
          limit: 5000,
          includeSubdomains: false,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeout);
      if (e instanceof DOMException && e.name === 'AbortError') {
        return new Response(
          JSON.stringify({ success: false, error: 'Map request timed out.' }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw e;
    }
    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl map error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Map failed with status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allLinks: string[] = data?.links || data?.data?.links || [];

    // Filter for product-like URLs
    const productPatterns = [
      /\/product[s]?\//i,
      /\/item[s]?\//i,
      /\/p\//i,
      /\/catalog\//i,
      /\/товар/i,
      /\/tovar/i,
      /\/shop\//i,
      /\/goods\//i,
      /\/(dp|gp)\//i, // Amazon
      /\/listings?\//i,
      /\/detail/i,
    ];

    // Also exclude common non-product pages
    const excludePatterns = [
      /\/(cart|checkout|login|register|account|privacy|terms|contact|about|faq|blog|news|sitemap|search|tag|category)\b/i,
      /\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|xml|json|woff|ttf)$/i,
      /\/#/,
    ];

    const productUrls = allLinks.filter((link: string) => {
      if (excludePatterns.some(p => p.test(link))) return false;
      // If site has clear product patterns, use them
      if (productPatterns.some(p => p.test(link))) return true;
      // Otherwise include pages with enough path depth (likely product pages)
      try {
        const u = new URL(link);
        const segments = u.pathname.split('/').filter(Boolean);
        return segments.length >= 2;
      } catch {
        return false;
      }
    });

    console.log(`Found ${allLinks.length} total URLs, ${productUrls.length} potential product URLs`);

    return new Response(
      JSON.stringify({
        success: true,
        totalUrls: allLinks.length,
        productUrls,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error mapping store:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to map store' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
