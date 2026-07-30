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
        JSON.stringify({ success: false, error: 'Firecrawl is not configured. Please connect the Firecrawl connector in Settings.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Scraping product URL:', formattedUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);

    let response: Response;
    try {
      response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: formattedUrl,
          formats: ['markdown'],
          onlyMainContent: true,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeout);
      if (e instanceof DOMException && e.name === 'AbortError') {
        return new Response(
          JSON.stringify({ success: false, error: 'Scrape timed out. The website may be too slow.' }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw e;
    }
    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Scrape failed with status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = data?.data?.markdown || data?.markdown || '';
    const html = data?.data?.html || data?.html || '';
    const metadata = data?.data?.metadata || data?.metadata || {};

    // Parse title
    const title = metadata.title || metadata.ogTitle || '';

    // Parse description
    const description = metadata.description || metadata.ogDescription || '';

    // Parse price from markdown - look for price patterns
    let priceNum: number | null = null;
    let currency = 'EUR';
    const pricePatterns = [
      /(?:Price|Цена|Preis|Prix)[:\s]*([€$£])\s*([\d.,]+)/i,
      /([€$£])\s*([\d.,]+)/,
      /([\d.,]+)\s*(€|USD|EUR|GBP|руб)/i,
    ];
    for (const pat of pricePatterns) {
      const m = markdown.match(pat);
      if (m) {
        const sym = m[1] || m[2];
        const numStr = (m[2] && /\d/.test(m[2])) ? m[2] : m[1];
        const cleaned = numStr.replace(/[^0-9.,]/g, '').replace(',', '.');
        const parsed = parseFloat(cleaned);
        if (!isNaN(parsed)) {
          priceNum = parsed;
          if (sym === '$' || sym === 'USD') currency = 'USD';
          else if (sym === '£' || sym === 'GBP') currency = 'GBP';
          else if (sym === '€' || sym === 'EUR') currency = 'EUR';
          else if (/руб/i.test(sym)) currency = 'RUB';
          break;
        }
      }
    }

    // Helper: filter junk image URLs
    const isJunkImage = (url: string): boolean => {
      const lower = url.toLowerCase();
      return lower.includes('logo') || lower.includes('favicon') ||
        lower.includes('icon') || lower.endsWith('.svg') ||
        lower.includes('maxlength=70') || lower.includes('plogos') ||
        lower.includes('placeholder') || lower.includes('spinner') ||
        lower.includes('spacer') || lower.includes('pixel') ||
        lower.includes('1x1') || lower.includes('blank.');
    };

    // Parse images from multiple sources
    const imageSet = new Set<string>();

    // 1. OG and Twitter metadata images
    if (metadata.ogImage) imageSet.add(metadata.ogImage);
    if (metadata['og:image']) imageSet.add(metadata['og:image']);
    if (metadata['twitter:image']) imageSet.add(metadata['twitter:image']);
    if (metadata.image) imageSet.add(metadata.image);

    // 2. Extract image URLs from markdown
    const mdImgRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
    let imgMatch;
    while ((imgMatch = mdImgRegex.exec(markdown)) !== null) {
      imageSet.add(imgMatch[1]);
    }

    // 3. Extract from plain URL references in markdown (common pattern: bare image URLs)
    const bareUrlRegex = /(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif|avif)(?:\?[^\s"'<>]*)?)/gi;
    let bareMatch;
    while ((bareMatch = bareUrlRegex.exec(markdown)) !== null) {
      imageSet.add(bareMatch[1]);
    }

    // Filter out junk and non-http
    const images = Array.from(imageSet).filter((u: string) =>
      u && u.startsWith('http') && !isJunkImage(u)
    );

    const product = {
      title,
      description,
      price: priceNum,
      currency,
      images,
      brand: '',
      sku: '',
      category: '',
      tags: [] as string[],
      sourceUrl: formattedUrl,
    };

    console.log('Extracted product:', product.title, '| images:', product.images?.length);

    return new Response(
      JSON.stringify({ success: true, product }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping product:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to scrape' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
