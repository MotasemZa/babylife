import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useProductList } from '@/hooks/useProductList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Loader2, Image, Film, Eye, Trash2, Download, ShoppingBag, DollarSign, Share2, LayoutGrid, Palette, Package } from 'lucide-react';
import { toast } from 'sonner';

type ContentMode = 'product_showcase' | 'pricing_banner' | 'social_post' | 'video_script';

interface VideoScript {
  scenes?: Array<{
    duration_seconds: number;
    text_overlay: string;
    sub_text?: string;
    background_color: string;
    text_color: string;
    animation: string;
  }>;
  music_mood?: string;
  total_duration?: number;
  raw?: string;
}

interface MarketingAsset {
  id: string;
  title: string;
  status: string;
  script: VideoScript;
  duration_seconds: number;
  created_at: string;
  video_url?: string;
  content_type: string;
  image_url?: string;
}

const modeConfig: Record<ContentMode, { label: string; icon: React.ReactNode; description: string }> = {
  product_showcase: { label: 'Product Image', icon: <ShoppingBag className="h-4 w-4" />, description: 'AI-generated promotional product graphic' },
  pricing_banner: { label: 'Pricing Banner', icon: <DollarSign className="h-4 w-4" />, description: 'Eye-catching pricing graphic with product + price' },
  social_post: { label: 'Social Post', icon: <Share2 className="h-4 w-4" />, description: 'Square image ready for Instagram / Facebook' },
  video_script: { label: 'Video Script', icon: <Film className="h-4 w-4" />, description: '15-second vertical reel storyboard' },
};

export const ContentCreator = () => {
  const { user } = useAuth();
  const { data: products = [] } = useProductList();
  const [selectedProduct, setSelectedProduct] = useState('');
  const [mode, setMode] = useState<ContentMode>('product_showcase');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [features, setFeatures] = useState('');

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
  const [style, setStyle] = useState('product_showcase');
  const [generating, setGenerating] = useState(false);
  const [previewScript, setPreviewScript] = useState<VideoScript | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [lastResult, setLastResult] = useState<{
    confidence_score: number;
    chosen_source: string;
    missing_fields: string[];
    notes: string;
  } | null>(null);

  const { data: assets = [], refetch } = useQuery({
    queryKey: ['marketing-assets', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('marketing_videos')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as MarketingAsset[];
    },
    enabled: !!user,
  });

  const handleGenerate = async () => {
    if (!title.trim()) { toast.error('Enter a product title'); return; }
    setGenerating(true);
    try {
      if (mode === 'video_script') {
        const { data, error } = await supabase.functions.invoke('generate-marketing-video', {
          body: { title, description, price, features, style },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setPreviewScript(data.script);
        toast.success('Video script generated! (2 credits used)');
      } else {
        const { data, error } = await supabase.functions.invoke('generate-marketing-image', {
          body: { title, description, price, features, imageType: mode },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setLastResult({
          confidence_score: data.confidence_score ?? 0,
          chosen_source: data.chosen_source ?? 'unknown',
          missing_fields: data.missing_fields ?? [],
          notes: data.notes ?? '',
        });
        toast.success(data.chosen_source === 'verified_search'
          ? `Real product image found! (Confidence: ${data.confidence_score}%)`
          : 'AI-generated image created (1 credit used)');
      }
      refetch();
    } catch (e: any) {
      toast.error(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('marketing_videos').delete().eq('id', id);
      if (error) throw error;
      refetch();
      toast.success('Deleted');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const filteredAssets = filterType === 'all' ? assets : assets.filter(a => a.content_type === filterType);
  const imageAssets = filteredAssets.filter(a => a.content_type !== 'video_script');
  const videoAssets = filteredAssets.filter(a => a.content_type === 'video_script');

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-accent" />
            Create Content
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as ContentMode)}
            className="flex flex-wrap gap-2 justify-start"
          >
            {(Object.entries(modeConfig) as [ContentMode, typeof modeConfig[ContentMode]][]).map(([key, cfg]) => (
              <ToggleGroupItem
                key={key}
                value={key}
                className="flex items-center gap-2 px-4 py-2 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
              >
                {cfg.icon}
                {cfg.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <p className="text-sm text-muted-foreground">{modeConfig[mode].description}</p>

          {/* Product picker */}
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

          {/* Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Product Title *</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Microsoft Office 2024" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Price</label>
              <Input value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. €49.99" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this product do?" rows={2} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Key Features</label>
              <Input value={features} onChange={e => setFeatures(e.target.value)} placeholder="e.g. Lifetime license, All apps included" />
            </div>
            {mode === 'video_script' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Video Style</label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product_showcase">Product Showcase</SelectItem>
                    <SelectItem value="feature_highlight">Feature Highlight</SelectItem>
                    <SelectItem value="sale_promo">Sale / Promo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Button onClick={handleGenerate} disabled={generating} className="w-full">
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
            ) : mode === 'video_script' ? (
              <><Film className="h-4 w-4" /> Generate Video Script (2 credits)</>
            ) : (
              <><Image className="h-4 w-4" /> Generate Image (1 credit)</>
            )}
          </Button>

          {/* Confidence result */}
          {lastResult && (
            <div className={`rounded-lg border p-3 space-y-1 ${
              lastResult.confidence_score >= 70 ? 'border-green-500/30 bg-green-500/5' :
              lastResult.confidence_score >= 40 ? 'border-yellow-500/30 bg-yellow-500/5' :
              'border-orange-500/30 bg-orange-500/5'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {lastResult.chosen_source === 'verified_search' ? '✅ Verified product image' : '🎨 AI-generated image'}
                </span>
                <Badge variant={lastResult.confidence_score >= 70 ? 'default' : 'secondary'}>
                  {lastResult.confidence_score}% confidence
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{lastResult.notes}</p>
              {lastResult.missing_fields.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Missing: {lastResult.missing_fields.join(', ')}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Video Script Preview */}
      {previewScript?.scenes && (
        <Card>
          <CardHeader>
            <CardTitle>Script Preview — {previewScript.total_duration || 15}s Reel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {previewScript.scenes.map((scene, i) => (
                <div
                  key={i}
                  className="rounded-xl p-4 flex flex-col items-center justify-center text-center min-h-[160px] relative overflow-hidden"
                  style={{ backgroundColor: scene.background_color, color: scene.text_color }}
                >
                  <Badge variant="outline" className="absolute top-2 left-2 text-xs bg-background/80">
                    Scene {i + 1} • {scene.duration_seconds}s
                  </Badge>
                  <p className="text-lg font-bold leading-tight">{scene.text_overlay}</p>
                  {scene.sub_text && <p className="text-sm mt-1 opacity-80">{scene.sub_text}</p>}
                  <Badge variant="outline" className="absolute bottom-2 right-2 text-xs bg-background/80">
                    {scene.animation}
                  </Badge>
                </div>
              ))}
            </div>
            {previewScript.music_mood && (
              <p className="text-sm text-muted-foreground mt-3">🎵 Suggested mood: <span className="font-medium">{previewScript.music_mood}</span></p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Content Library */}
      {assets.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5" />
                Content Library
              </CardTitle>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="product_showcase">Product Images</SelectItem>
                  <SelectItem value="pricing_banner">Pricing Banners</SelectItem>
                  <SelectItem value="social_post">Social Posts</SelectItem>
                  <SelectItem value="video_script">Video Scripts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {/* Image grid */}
            {imageAssets.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
                {imageAssets.map(asset => (
                  <div key={asset.id} className="group relative rounded-lg overflow-hidden border bg-muted/30">
                    {asset.image_url ? (
                      <img src={asset.image_url} alt={asset.title} className="w-full aspect-square object-cover" />
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center">
                        <Image className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                      <p className="text-white text-xs font-medium text-center px-2 line-clamp-2">{asset.title}</p>
                      <div className="flex gap-1">
                        {asset.image_url && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:text-white hover:bg-white/20" asChild>
                            <a href={asset.image_url} download target="_blank" rel="noopener noreferrer">
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-white/20" onClick={() => handleDelete(asset.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <Badge className="absolute top-1 left-1 text-[10px]" variant="secondary">
                      {asset.content_type.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Video scripts list */}
            {videoAssets.length > 0 && (
              <div className="space-y-3">
                {videoAssets.map(asset => (
                  <div key={asset.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Film className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{asset.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {asset.duration_seconds}s • {new Date(asset.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={asset.status === 'ready' ? 'default' : 'secondary'}>{asset.status}</Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewScript((asset.script as VideoScript) || null)}>
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(asset.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filteredAssets.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No content found for this filter.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
