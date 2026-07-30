import { useState, useEffect } from 'react';
import { Zap, Image, Loader2, Sparkles, Send, Plus, X, RefreshCw, Check, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ebayService } from '@/services/ebayService';

interface AISuggestions {
  improvedTitle: string;
  titleVariations: string[];
  improvedDescription: string;
  suggestedKeywords: string[];
  suggestedPrice: string;
  suggestedCategory: string;
  condition: string;
  tags: string[];
  productType: string;
  suggestedQuantity: string;
  tips: string[];
  cleanedImages?: string[];
  metafields?: Record<string, string>;
}

interface FinalListing {
  title: string;
  description: string;
  price: string;
  quantity: string;
  condition: string;
  category: string;
  tags: string;
  productType: string;
  imageUrls: string[];
  status: string;
  inventoryTracked: boolean;
  physicalProduct: boolean;
  collectionId: string;
  metafields: Array<{ namespace: string; key: string; value: string; type: string }>;
}

interface ShopifyCollection {
  id: number;
  title: string;
  type: string;
}

interface MetafieldDef {
  namespace: string;
  key: string;
  name: string;
  type: string;
}

interface OneClickListerTabProps {
  metafieldDefs?: MetafieldDef[];
}

const OneClickListerTab = ({ metafieldDefs: propMetafieldDefs }: OneClickListerTabProps) => {
  const { user } = useAuth();
  const [step, setStep] = useState<'images' | 'review' | 'publishing'>('images');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestions | null>(null);
  const [finalListing, setFinalListing] = useState<FinalListing | null>(null);
  const [generatingVariation, setGeneratingVariation] = useState<number | null>(null);
  const [fixingImage, setFixingImage] = useState<number | null>(null);
  const [regeneratingField, setRegeneratingField] = useState<string | null>(null);
  const [enableTags, setEnableTags] = useState(true);
  const [collections, setCollections] = useState<ShopifyCollection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [metafieldDefs, setMetafieldDefs] = useState<MetafieldDef[]>(propMetafieldDefs || []);
  const [metafieldValues, setMetafieldValues] = useState<Record<string, string>>({});

  // Platform connection states
  const [ebayConnected, setEbayConnected] = useState(false);
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [publishToEbay, setPublishToEbay] = useState(false);
  const [publishToShopify, setPublishToShopify] = useState(false);

  useEffect(() => {
    checkConnections();
  }, [user]);

  const fetchCollections = async () => {
    setLoadingCollections(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-fetch-collections', { body: {} });
      if (!error && data?.collections) {
        setCollections(data.collections);
      }
    } catch { /* ignore */ }
    setLoadingCollections(false);
  };

  // Sync metafieldDefs from parent prop
  useEffect(() => {
    if (propMetafieldDefs && propMetafieldDefs.length > 0) {
      setMetafieldDefs(propMetafieldDefs);
    }
  }, [propMetafieldDefs]);

  const fetchMetafieldDefs = async () => {
    if (propMetafieldDefs && propMetafieldDefs.length > 0) return; // Already provided by parent
    try {
      const { data, error } = await supabase.functions.invoke('shopify-fetch-metafields', { body: {} });
      if (!error && data?.definitions) {
        setMetafieldDefs(data.definitions);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (shopifyConnected && collections.length === 0) fetchCollections();
    if (shopifyConnected && metafieldDefs.length === 0) fetchMetafieldDefs();
  }, [shopifyConnected]);

  const checkConnections = async () => {
    if (!user) return;
    try {
      const ebayStatus = await ebayService.checkConnectionStatus();
      setEbayConnected(ebayStatus.connected && !ebayStatus.tokenExpired);

      const { data: shopifyCreds } = await supabase
        .from('user_shopify_credentials')
        .select('access_token')
        .eq('user_id', user.id)
        .maybeSingle();
      setShopifyConnected(!!shopifyCreds?.access_token);
    } catch {
      // ignore
    }
  };

  const addImageUrl = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast.error('Please enter a valid URL starting with http:// or https://');
      return;
    }
    if (imageUrls.includes(url)) {
      toast.error('This image URL is already added');
      return;
    }
    if (imageUrls.length >= 12) {
      toast.error('Maximum 12 images allowed');
      return;
    }
    setImageUrls(prev => [...prev, url]);
    setImageUrlInput('');
  };

  const removeImageUrl = (url: string) => {
    setImageUrls(prev => prev.filter(u => u !== url));
  };

  const generateImageVariation = async (url: string, idx: number) => {
    if (!user) return;
    if (imageUrls.length >= 12) {
      toast.error('Maximum 12 images allowed');
      return;
    }
    setGeneratingVariation(idx);
    try {
      const { data, error } = await supabase.functions.invoke('generate-listing-suggestions', {
        body: { generateVariation: true, sourceImageUrl: url },
      });
      if (error) throw error;
      if (data?.variationImage) {
        // Insert variation right after the source image
        setImageUrls(prev => {
          const newUrls = [...prev];
          newUrls.splice(idx + 1, 0, data.variationImage);
          return newUrls;
        });
        toast.success('Image variation generated!');
      } else {
        throw new Error('No variation returned');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate variation');
    } finally {
      setGeneratingVariation(null);
    }
  };

  const fixSingleImage = async (url: string, idx: number) => {
    if (!user) return;
    setFixingImage(idx);
    try {
      const { data, error } = await supabase.functions.invoke('generate-listing-suggestions', {
        body: { fixSingleImage: true, imageUrl: url },
      });
      if (error) throw error;
      if (data?.cleanedImage) {
        setImageUrls(prev => prev.map((u, i) => i === idx ? data.cleanedImage : u));
        toast.success('Image cleaned!');
      } else {
        throw new Error('Failed to clean image');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fix image');
    } finally {
      setFixingImage(null);
    }
  };

  const autoFillWithAI = async () => {
    if (!user) {
      toast.error('Please sign in to use the AI lister');
      return;
    }
    if (imageUrls.length === 0) {
      toast.error('Please add at least one product image');
      return;
    }

    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Session expired. Please sign in again.');
        return;
      }

      const response = await supabase.functions.invoke('generate-listing-suggestions', {
        body: {
          imageUrls,
          analyzeImages: true,
          metafieldDefinitions: metafieldDefs.length > 0 ? metafieldDefs : undefined,
        }
      });

      if (response.error) throw new Error(response.error.message || 'Failed to generate suggestions');
      const data = response.data;
      if (data.error) throw new Error(data.error);

      const s = data.suggestions as AISuggestions;
      setSuggestions(s);

      // Build metafield values from AI response
      const mfValues: Record<string, string> = {};
      if (s.metafields && typeof s.metafields === 'object') {
        for (const [compositeKey, value] of Object.entries(s.metafields)) {
          mfValues[compositeKey] = String(value || '');
        }
      }
      setMetafieldValues(mfValues);

      setFinalListing({
        title: s.improvedTitle || '',
        description: s.improvedDescription || '',
        price: s.suggestedPrice || '9.99',
        quantity: s.suggestedQuantity || '1',
        condition: s.condition || 'New',
        category: s.suggestedCategory || '',
        tags: (s.tags || []).join(', '),
        productType: s.productType || '',
        imageUrls,
        status: 'active',
        inventoryTracked: true,
        physicalProduct: false,
        collectionId: '',
        metafields: [],
      });
      setPublishToEbay(ebayConnected);
      setPublishToShopify(shopifyConnected);
      setStep('review');
      toast.success('AI auto-filled all listing fields from your images!');
    } catch (error) {
      console.error('Error generating suggestions:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate suggestions');
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerateField = async (fieldName: string) => {
    if (!user || !finalListing) return;
    setRegeneratingField(fieldName);
    try {
      const response = await supabase.functions.invoke('generate-listing-suggestions', {
        body: {
          imageUrls: finalListing.imageUrls,
          analyzeImages: true,
        }
      });

      if (response.error) throw new Error(response.error.message);
      const data = response.data;
      if (data.error) throw new Error(data.error);

      const s = data.suggestions as AISuggestions;
      
      // Only update the specific field
      setFinalListing(prev => {
        if (!prev) return null;
        switch (fieldName) {
          case 'title': return { ...prev, title: s.improvedTitle || prev.title };
          case 'description': return { ...prev, description: s.improvedDescription || prev.description };
          case 'price': return { ...prev, price: s.suggestedPrice || prev.price };
          case 'quantity': return { ...prev, quantity: s.suggestedQuantity || prev.quantity };
          case 'category': return { ...prev, category: s.suggestedCategory || prev.category };
          case 'tags': return { ...prev, tags: (s.tags || []).join(', ') || prev.tags };
          case 'productType': return { ...prev, productType: s.productType || prev.productType };
          case 'condition': return { ...prev, condition: s.condition || prev.condition };
          default: return prev;
        }
      });
      toast.success(`${fieldName} regenerated!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to regenerate');
    } finally {
      setRegeneratingField(null);
    }
  };

  const publishListing = async () => {
    if (!user || !finalListing) return;
    if (!publishToEbay && !publishToShopify) {
      toast.error('Please select at least one platform to publish to');
      return;
    }
    if (!finalListing.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!finalListing.price || parseFloat(finalListing.price) <= 0) {
      toast.error('Valid price is required');
      return;
    }

    setIsPublishing(true);
    setStep('publishing');

    const results: string[] = [];
    const errors: string[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Session expired. Please sign in again.');
        setStep('review');
        setIsPublishing(false);
        return;
      }

      if (publishToEbay) {
        try {
          const response = await supabase.functions.invoke('ebay-create-listing', {
            body: {
              title: finalListing.title,
              description: finalListing.description,
              price: parseFloat(finalListing.price),
              quantity: parseInt(finalListing.quantity) || 1,
              imageUrls: finalListing.imageUrls,
              condition: finalListing.condition,
              category: finalListing.category,
            }
          });
          if (response.error || response.data?.error) {
            throw new Error(response.data?.error || response.error?.message || 'eBay publish failed');
          }
          results.push('eBay');
        } catch (e) {
          errors.push(`eBay: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }

      if (publishToShopify) {
        try {
          const tagsArray = enableTags ? finalListing.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
          const response = await supabase.functions.invoke('shopify-create-listing', {
            body: {
              title: finalListing.title,
              description: finalListing.description,
              price: parseFloat(finalListing.price),
              quantity: parseInt(finalListing.quantity) || 1,
              imageUrls: finalListing.imageUrls,
              tags: tagsArray,
              productType: finalListing.productType,
              status: finalListing.status,
              inventoryTracked: finalListing.inventoryTracked,
              physicalProduct: finalListing.physicalProduct,
              collectionId: finalListing.collectionId ? parseInt(finalListing.collectionId) : null,
              metafields: metafieldDefs.length > 0 ? metafieldDefs.map(mf => ({
                namespace: mf.namespace,
                key: mf.key,
                value: metafieldValues[`${mf.namespace}__${mf.key}`] || '',
                type: mf.type || 'single_line_text_field',
              })).filter(mf => mf.value) : undefined,
            }
          });
          if (response.error || response.data?.error) {
            throw new Error(response.data?.error || response.error?.message || 'Shopify publish failed');
          }
          results.push('Shopify');
        } catch (e) {
          errors.push(`Shopify: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }

      if (results.length > 0) {
        toast.success(`Listing published to ${results.join(' & ')}!`);
      }
      if (errors.length > 0) {
        toast.error(`Failed on: ${errors.join('; ')}`);
      }

      if (results.length > 0) {
        setImageUrls([]);
        setSuggestions(null);
        setFinalListing(null);
        setStep('images');
      } else {
        setStep('review');
      }
    } catch (error) {
      console.error('Error publishing:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish listing');
      setStep('review');
    } finally {
      setIsPublishing(false);
    }
  };

  const resetToImages = () => {
    setStep('images');
    setSuggestions(null);
    setFinalListing(null);
  };

  const RegenerateButton = ({ field }: { field: string }) => (
    <button
      onClick={() => regenerateField(field)}
      disabled={regeneratingField !== null}
      className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
      title={`Regenerate ${field}`}
    >
      {regeneratingField === field ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
    </button>
  );

  return (
    <div className="space-y-6 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Smart Listing Creator
          </CardTitle>
          <CardDescription>
            Upload product images and AI will auto-fill everything — title, description, price, category, and more. Then publish to eBay, Shopify, or both.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Step 1: Images */}
          {step === 'images' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-base font-semibold">
                  <Image className="h-5 w-5" />
                  Product Images
                </Label>
                <p className="text-sm text-muted-foreground">
                  Add your product images and AI will identify the product and auto-fill all listing details.
                </p>

                <div className="flex gap-2">
                  <Input
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="Paste image URL (https://...)"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addImageUrl())}
                  />
                  <Button type="button" onClick={addImageUrl} variant="outline" size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {imageUrls.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {imageUrls.map((url, idx) => (
                      <div key={`img-${idx}`} className="flex flex-col gap-2">
                        {/* Image card */}
                        <div className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                          <img
                            src={url}
                            alt={`Product ${idx + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                          />
                          {/* Fixing spinner overlay */}
                          {fixingImage === idx && (
                            <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                          )}
                          {/* Remove button - hover */}
                          <button
                            onClick={() => removeImageUrl(url)}
                            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          {/* Fix image button - hover */}
                          <button
                            onClick={() => fixSingleImage(url, idx)}
                            disabled={fixingImage !== null}
                            className="absolute bottom-1 right-1 bg-primary text-primary-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                            title="Fix image — remove watermarks & overlays"
                          >
                            <Wand2 className="h-3 w-3" />
                          </button>
                          <Badge className="absolute bottom-1 left-1 text-xs" variant="secondary">{idx + 1}</Badge>
                        </div>

                        {/* Variation placeholder card - appears next to image */}
                        {imageUrls.length < 12 && (
                          <button
                            onClick={() => generateImageVariation(url, idx)}
                            disabled={generatingVariation !== null || imageUrls.length >= 12}
                            className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Generate AI variation of this image"
                          >
                            {generatingVariation === idx ? (
                              <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            ) : (
                              <>
                                <Plus className="h-5 w-5 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground">AI Variation</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  {imageUrls.length}/12 images • First image will be the main listing photo • Hover to fix or remove
                </p>
              </div>

              <Button
                onClick={autoFillWithAI}
                disabled={isGenerating || imageUrls.length === 0}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    AI is analyzing your images...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Auto-Fill with AI
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Step 2: Review */}
          {step === 'review' && finalListing && (
            <div className="space-y-6">
              {/* AI Tips */}
              {suggestions?.tips && suggestions.tips.length > 0 && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <h4 className="font-medium flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Optimization Tips
                  </h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    {suggestions.tips.map((tip, idx) => (
                      <li key={idx}>• {tip}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Keywords */}
              {suggestions?.suggestedKeywords && suggestions.suggestedKeywords.length > 0 && (
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Suggested Keywords</Label>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.suggestedKeywords.map((kw, idx) => (
                      <Badge key={idx} variant="secondary">{kw}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Images preview */}
              {finalListing.imageUrls.length > 0 && (
                <div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {finalListing.imageUrls.map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt={`Product ${idx + 1}`}
                        className="h-20 w-20 object-cover rounded-md border flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Editable fields with regenerate buttons */}
              <div className="space-y-4">
                <h4 className="font-medium">Review & Edit Listing</h4>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="final-title">Title</Label>
                    <RegenerateButton field="title" />
                  </div>
                  <Input
                    id="final-title"
                    value={finalListing.title}
                    onChange={(e) => setFinalListing(prev => prev ? { ...prev, title: e.target.value } : null)}
                    maxLength={80}
                  />
                  <p className="text-xs text-muted-foreground">{finalListing.title.length}/80 characters</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="final-description">Description</Label>
                    <RegenerateButton field="description" />
                  </div>
                  <Textarea
                    id="final-description"
                    value={finalListing.description}
                    onChange={(e) => setFinalListing(prev => prev ? { ...prev, description: e.target.value } : null)}
                    rows={6}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="final-price">Price (USD)</Label>
                      <RegenerateButton field="price" />
                    </div>
                    <Input
                      id="final-price"
                      type="number"
                      step="0.01"
                      value={finalListing.price}
                      onChange={(e) => setFinalListing(prev => prev ? { ...prev, price: e.target.value } : null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="final-quantity">Quantity</Label>
                      <RegenerateButton field="quantity" />
                    </div>
                    <Input
                      id="final-quantity"
                      type="number"
                      min="1"
                      value={finalListing.quantity}
                      onChange={(e) => setFinalListing(prev => prev ? { ...prev, quantity: e.target.value } : null)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>Condition</Label>
                      <RegenerateButton field="condition" />
                    </div>
                    <Select
                      value={finalListing.condition}
                      onValueChange={(v) => setFinalListing(prev => prev ? { ...prev, condition: v } : null)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="New">New</SelectItem>
                        <SelectItem value="Used">Used</SelectItem>
                        <SelectItem value="Refurbished">Refurbished</SelectItem>
                        <SelectItem value="For parts or not working">For parts or not working</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="final-category">Category</Label>
                      <RegenerateButton field="category" />
                    </div>
                    <Input
                      id="final-category"
                      value={finalListing.category}
                      onChange={(e) => setFinalListing(prev => prev ? { ...prev, category: e.target.value } : null)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox id="enable-tags" checked={enableTags} onCheckedChange={(c) => setEnableTags(!!c)} />
                      <Label htmlFor="enable-tags" className="cursor-pointer">Enable Tags</Label>
                      {enableTags && <RegenerateButton field="tags" />}
                    </div>
                    {enableTags && (
                      <Input
                        id="final-tags"
                        value={finalListing.tags}
                        onChange={(e) => setFinalListing(prev => prev ? { ...prev, tags: e.target.value } : null)}
                        placeholder="tag1, tag2, tag3"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="final-product-type">Product Type</Label>
                      <RegenerateButton field="productType" />
                    </div>
                    <Input
                      id="final-product-type"
                      value={finalListing.productType}
                      onChange={(e) => setFinalListing(prev => prev ? { ...prev, productType: e.target.value } : null)}
                    />
                  </div>
                </div>
              </div>

              {/* Metafields Section */}
              {metafieldDefs.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Metafields
                      <Badge variant="secondary" className="text-xs">{metafieldDefs.length}</Badge>
                    </h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      {metafieldDefs.map(mf => {
                        const compositeKey = `${mf.namespace}__${mf.key}`;
                        return (
                          <div key={compositeKey} className="space-y-1">
                            <Label className="text-sm">{mf.name || mf.key}</Label>
                            <Input
                              value={metafieldValues[compositeKey] || ''}
                              onChange={(e) => setMetafieldValues(prev => ({ ...prev, [compositeKey]: e.target.value }))}
                              placeholder={`${mf.type}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Listing Options */}
              <div className="space-y-4">
                <h4 className="font-medium">Listing Options</h4>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={finalListing.status}
                      onValueChange={(v) => setFinalListing(prev => prev ? { ...prev, status: v } : null)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="unlisted">Unlisted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {publishToShopify && collections.length > 0 && (
                    <div className="space-y-2">
                      <Label>Collection</Label>
                    <Select
                        value={finalListing.collectionId || 'none'}
                        onValueChange={(v) => setFinalListing(prev => prev ? { ...prev, collectionId: v === 'none' ? '' : v } : null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {collections.map(c => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={finalListing.inventoryTracked}
                      onCheckedChange={(c) => setFinalListing(prev => prev ? { ...prev, inventoryTracked: !!c } : null)}
                    />
                    <span className="text-sm">Inventory Tracked</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={finalListing.physicalProduct}
                      onCheckedChange={(c) => setFinalListing(prev => prev ? { ...prev, physicalProduct: !!c } : null)}
                    />
                    <span className="text-sm">Physical Product</span>
                  </label>
                </div>
              </div>

              <Separator />

              {/* Platform selection */}
              <div className="space-y-3">
                <h4 className="font-medium">Publish To</h4>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={publishToEbay}
                      onCheckedChange={(c) => setPublishToEbay(!!c)}
                      disabled={!ebayConnected}
                    />
                    <span className={!ebayConnected ? 'text-muted-foreground' : ''}>
                      eBay {!ebayConnected && '(not connected)'}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={publishToShopify}
                      onCheckedChange={(c) => setPublishToShopify(!!c)}
                      disabled={!shopifyConnected}
                    />
                    <span className={!shopifyConnected ? 'text-muted-foreground' : ''}>
                      Shopify {!shopifyConnected && '(not connected)'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={resetToImages} className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Start Over
                </Button>
                <Button
                  onClick={publishListing}
                  disabled={isPublishing || (!publishToEbay && !publishToShopify)}
                  className="flex-1"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Publish Listing
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Publishing */}
          {step === 'publishing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-lg font-medium">Publishing your listing...</p>
              <p className="text-sm text-muted-foreground">
                Sending to {[publishToEbay && 'eBay', publishToShopify && 'Shopify'].filter(Boolean).join(' & ')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OneClickListerTab;
