import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProductList } from '@/hooks/useProductList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Copy, Loader2, Sparkles, Check, Package, Facebook } from 'lucide-react';
import { toast } from 'sonner';
import { FacebookPublishDialog } from './FacebookPublishDialog';

interface AdCopy {
  headlines?: string[];
  descriptions?: string[];
  primary_text?: string;
  headline?: string;
  description?: string;
  cta?: string;
  raw?: string;
}

export const AdCopyGenerator = () => {
  const { user } = useAuth();
  const { data: products = [] } = useProductList();
  const [selectedProduct, setSelectedProduct] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');

  const handleProductSelect = (productId: string) => {
    setSelectedProduct(productId);
    if (productId === '__none__') return;
    const product = products.find(p => p.id === productId);
    if (product) {
      setTitle(product.name);
      setDescription(product.description);
      setPrice(product.price);
    }
  };
  const [platform, setPlatform] = useState('google_ads');
  const [tone, setTone] = useState('professional');
  const [targetAudience, setTargetAudience] = useState('');
  const [usps, setUsps] = useState('');
  const [generating, setGenerating] = useState(false);
  const [adCopy, setAdCopy] = useState<AdCopy | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showFbPublish, setShowFbPublish] = useState(false);

  const handleGenerate = async () => {
    if (!title.trim()) {
      toast.error('Please enter a product title');
      return;
    }
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('generate-ad-copy', {
        body: { title, description, price, platform, tone, targetAudience, usps },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAdCopy(data.adCopy);
      toast.success('Ad copy generated!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate ad copy');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success('Copied to clipboard');
  };

  const handleSaveAsCampaign = async () => {
    if (!adCopy || !user) return;
    try {
      const { error } = await supabase.from('marketing_campaigns').insert({
        user_id: user.id,
        name: `${title} - ${platform} campaign`,
        platform,
        ad_copy: adCopy as any,
        status: 'draft',
      });
      if (error) throw error;
      toast.success('Saved as campaign draft!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save campaign');
    }
  };

  const charCount = (text: string, max: number) => {
    const len = text.length;
    return (
      <span className={len > max ? 'text-destructive font-medium' : 'text-muted-foreground'}>
        {len}/{max}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            Generate Ad Copy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {products.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" /> Pick from your products (optional)
              </label>
              <Select value={selectedProduct} onValueChange={handleProductSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a product to auto-fill..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.price ? ` • ${p.price}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Product Title *</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Norton 360 Deluxe" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Price</label>
              <Input value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. $29.99" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief product description..." rows={3} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Platform</label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google_ads">Google Ads</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tone</label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="casual">Casual & Friendly</SelectItem>
                  <SelectItem value="urgent">Urgent / FOMO</SelectItem>
                  <SelectItem value="luxurious">Premium / Luxurious</SelectItem>
                  <SelectItem value="playful">Playful & Fun</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Audience</label>
              <Input value={targetAudience} onChange={e => setTargetAudience(e.target.value)} placeholder="e.g. Small business owners" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Key Selling Points</label>
            <Input value={usps} onChange={e => setUsps(e.target.value)} placeholder="e.g. Lifetime license, instant delivery, 24/7 support" />
          </div>
          <Button onClick={handleGenerate} disabled={generating} className="w-full">
            {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Sparkles className="h-4 w-4" /> Generate Ad Copy</>}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {adCopy && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>Generated Copy — <Badge variant="outline">{platform === 'google_ads' ? 'Google Ads' : platform === 'facebook' ? 'Facebook' : 'Instagram'}</Badge></CardTitle>
              <div className="flex items-center gap-2">
                {(platform === 'facebook' || platform === 'instagram') && (
                  <Button size="sm" onClick={() => setShowFbPublish(true)} className="bg-[#1877F2] hover:bg-[#1877F2]/90">
                    <Facebook className="h-3.5 w-3.5" /> Publish to Facebook
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleSaveAsCampaign}>Save as Campaign</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Google Ads format */}
            {adCopy.headlines && (
              <>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Headlines</h4>
                  {adCopy.headlines.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                      <span className="flex-1 font-medium">{h}</span>
                      {charCount(h, 30)}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(h, `h-${i}`)}>
                        {copiedField === `h-${i}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Descriptions</h4>
                  {adCopy.descriptions?.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                      <span className="flex-1">{d}</span>
                      {charCount(d, 90)}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(d, `d-${i}`)}>
                        {copiedField === `d-${i}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Facebook/Instagram format */}
            {adCopy.primary_text && (
              <div className="space-y-3">
                {[
                  { label: 'Primary Text', value: adCopy.primary_text, max: 125, key: 'pt' },
                  { label: 'Headline', value: adCopy.headline || '', max: 40, key: 'hl' },
                  { label: 'Description', value: adCopy.description || '', max: 30, key: 'desc' },
                  { label: 'CTA', value: adCopy.cta || '', max: 20, key: 'cta' },
                ].map(field => (
                  <div key={field.key} className="space-y-1">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{field.label}</h4>
                    <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                      <span className="flex-1">{field.value}</span>
                      {charCount(field.value, field.max)}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(field.value, field.key)}>
                        {copiedField === field.key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Raw fallback */}
            {adCopy.raw && !adCopy.headlines && !adCopy.primary_text && (
              <div className="p-3 rounded-md bg-muted/50 whitespace-pre-wrap">{adCopy.raw}</div>
            )}
          </CardContent>
        </Card>
      )}

      {adCopy && (
        <FacebookPublishDialog
          open={showFbPublish}
          onOpenChange={setShowFbPublish}
          adCopy={adCopy}
          platform={platform}
          title={title}
        />
      )}
    </div>
  );
};
