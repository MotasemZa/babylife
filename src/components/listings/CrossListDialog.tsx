import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Store, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface EbayListing {
  id: string;
  ebay_item_id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  quantity: number | null;
  sku: string | null;
  image_url: string | null;
  listing_url: string | null;
  status: string | null;
  raw_data?: any;
}

interface CrossListDialogProps {
  listing: EbayListing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const CrossListDialog = ({ listing, open, onOpenChange, onSuccess }: CrossListDialogProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [tags, setTags] = useState('');
  const [productType, setProductType] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  // Reset form when listing changes
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && listing) {
      setTitle(listing.title);
      setDescription('');
      setPrice(listing.price?.toString() || '');
      setQuantity(listing.quantity?.toString() || '1');
      setTags('');
      setProductType('');
      setAiGenerated(false);
    }
    onOpenChange(newOpen);
  };

  const generateWithAI = async () => {
    if (!listing) return;
    setIsGenerating(true);

    try {
      // Extract category/condition from raw_data if available
      const rawData = listing.raw_data;
      const category = rawData?.PrimaryCategory?.CategoryName || rawData?.category || '';
      const condition = rawData?.ConditionDisplayName || rawData?.condition || '';

      const { data, error } = await supabase.functions.invoke('crosslist-ai-fill', {
        body: {
          title: listing.title,
          category,
          condition,
          price: listing.price,
          imageUrls: listing.image_url ? [listing.image_url] : [],
        },
      });

      if (error) throw error;
      if (data?.error) {
        if (data.error.includes('credits')) {
          toast.error(data.error);
        } else {
          throw new Error(data.error);
        }
        return;
      }

      const suggestions = data.suggestions;
      if (suggestions) {
        setDescription(suggestions.description || '');
        setTags(Array.isArray(suggestions.tags) ? suggestions.tags.join(', ') : (suggestions.tags || ''));
        setProductType(suggestions.productType || '');
        setAiGenerated(true);
        toast.success(`AI suggestions generated (${data.creditsRemaining} credits left)`);
      }
    } catch (error) {
      console.error('AI generation error:', error);
      toast.error('Failed to generate AI suggestions');
    } finally {
      setIsGenerating(false);
    }
  };

  const publishToShopify = async () => {
    if (!listing || !title.trim() || !price) {
      toast.error('Title and price are required');
      return;
    }

    setIsPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-create-listing', {
        body: {
          title: title.trim(),
          description,
          price: parseFloat(price),
          quantity: quantity ? parseInt(quantity) : 1,
          imageUrls: listing.image_url ? [listing.image_url] : [],
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
          productType,
          ebayItemId: listing.ebay_item_id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Listed on Shopify successfully!');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Publish error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish to Shopify');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Cross-list to Shopify
          </DialogTitle>
          <DialogDescription>
            Publish this eBay listing to Shopify. Both platforms will share the same inventory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source info */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            {listing?.image_url && (
              <img src={listing.image_url} alt="" className="w-12 h-12 object-cover rounded" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{listing?.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">eBay</Badge>
                <span className="text-xs text-muted-foreground">
                  {listing?.price} {listing?.currency || 'EUR'} · Stock: {listing?.quantity ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* AI Generate button */}
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={generateWithAI}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isGenerating ? 'Generating...' : 'Auto-fill with AI'}
            {aiGenerated && <Badge variant="secondary" className="text-xs ml-1">Done</Badge>}
          </Button>

          {/* Editable fields */}
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div>
              <Label>Description (HTML)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Click 'Auto-fill with AI' to generate a Shopify description"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Price (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div>
                <Label>Stock</Label>
                <Input
                  type="number"
                  value={quantity}
                  readOnly
                  disabled
                  className="opacity-60"
                />
                <p className="text-xs text-muted-foreground mt-1">Stock syncs from the source listing</p>
              </div>
            </div>

            <div>
              <Label>Tags (comma-separated)</Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="software, digital, license"
              />
            </div>

            <div>
              <Label>Product Type</Label>
              <Input
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                placeholder="e.g. Software"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPublishing}>
            Cancel
          </Button>
          <Button onClick={publishToShopify} disabled={isPublishing || !title.trim() || !price}>
            {isPublishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Publishing...
              </>
            ) : (
              <>
                <Store className="h-4 w-4 mr-2" />
                Publish to Shopify
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CrossListDialog;
