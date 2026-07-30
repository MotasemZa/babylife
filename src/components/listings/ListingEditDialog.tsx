import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Listing {
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
  start_time: string | null;
  updated_at: string;
}

interface MetafieldDef {
  key: string;
  namespace: string;
  name: string;
  description: string;
  type: string;
}

interface ListingEditDialogProps {
  listing: Listing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (listing: Listing) => void;
  platforms?: string[];
  shopifyRawData?: any;
}

const ListingEditDialog = ({ listing, open, onOpenChange, onSave, platforms, shopifyRawData }: ListingEditDialogProps) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    currency: 'EUR',
    quantity: '',
    sku: '',
    image_url: '',
    listing_url: '',
    status: 'active',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [pushToEbay, setPushToEbay] = useState(true);

  // Metafield state
  const [metafieldDefs, setMetafieldDefs] = useState<MetafieldDef[]>([]);
  const [metafieldValues, setMetafieldValues] = useState<Record<string, string>>({});
  const [loadingMetafields, setLoadingMetafields] = useState(false);

  const hasShopify = platforms?.includes('shopify');

  useEffect(() => {
    if (listing) {
      setFormData({
        title: listing.title || '',
        description: listing.description || '',
        price: listing.price?.toString() || '',
        currency: listing.currency || 'EUR',
        quantity: listing.quantity?.toString() || '',
        sku: listing.sku || '',
        image_url: listing.image_url || '',
        listing_url: listing.listing_url || '',
        status: listing.status || 'active',
      });
    }
  }, [listing]);

  // Fetch metafield definitions when dialog opens with a Shopify listing
  useEffect(() => {
    if (!open || !hasShopify) {
      setMetafieldDefs([]);
      setMetafieldValues({});
      return;
    }

    const fetchMetafields = async () => {
      setLoadingMetafields(true);
      try {
        const { data, error } = await supabase.functions.invoke('shopify-fetch-metafields', {
          body: {},
        });
        if (!error && data?.definitions) {
          setMetafieldDefs(data.definitions);

          // Pre-fill from shopifyRawData.metafields if available
          const existing: Record<string, string> = {};
          const rawMetafields = shopifyRawData?.metafields;
          if (rawMetafields && typeof rawMetafields === 'object') {
            for (const [k, v] of Object.entries(rawMetafields)) {
              existing[k] = String(v);
            }
          }
          setMetafieldValues(existing);
        }
      } catch (err) {
        console.error('Failed to fetch metafield definitions:', err);
      } finally {
        setLoadingMetafields(false);
      }
    };

    fetchMetafields();
  }, [open, hasShopify]);

  const handleSave = async () => {
    if (!listing) return;

    setIsSaving(true);
    try {
      const updates = {
        title: formData.title,
        description: formData.description || null,
        price: formData.price ? parseFloat(formData.price) : null,
        currency: formData.currency,
        quantity: formData.quantity ? parseInt(formData.quantity) : null,
        sku: formData.sku || null,
        image_url: formData.image_url || null,
        listing_url: formData.listing_url || null,
        status: formData.status,
        updated_at: new Date().toISOString(),
      };

      // Push to eBay if enabled and has SKU
      if (pushToEbay && formData.sku) {
        const { data, error } = await supabase.functions.invoke('ebay-update-listing', {
          body: {
            updates: [{
              sku: formData.sku,
              itemId: listing.ebay_item_id,
              title: formData.title,
              description: formData.description,
              price: formData.price ? parseFloat(formData.price) : undefined,
              quantity: formData.quantity ? parseInt(formData.quantity) : undefined,
              currency: formData.currency,
            }],
          },
        });

        if (error) {
          throw new Error(error.message || 'Failed to update on eBay');
        }

        if (data?.summary?.failed > 0) {
          const errorMsg = data?.results?.[0]?.error || 'eBay update failed';
          toast.error(`eBay: ${errorMsg}`);
        } else {
          toast.success('Updated on eBay');
        }
      }

      // Save to local database
      const { error } = await supabase
        .from('listings')
        .update(updates)
        .eq('id', listing.id);

      if (error) throw error;

      onSave({ ...listing, ...updates });
      toast.success('Listing saved locally');
    } catch (error) {
      console.error('Error updating listing:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update listing');
    } finally {
      setIsSaving(false);
    }
  };

  if (!listing) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Listing</DialogTitle>
          <DialogDescription>
            eBay Item ID: {listing.ebay_item_id} {listing.sku && `• SKU: ${listing.sku}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Push to eBay toggle */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="push-ebay" className="text-sm font-medium">Push changes to eBay</Label>
              <p className="text-xs text-muted-foreground">
                {formData.sku 
                  ? 'Update this listing on eBay when saving' 
                  : 'SKU required to push to eBay'}
              </p>
            </div>
            <Switch 
              id="push-ebay"
              checked={pushToEbay} 
              onCheckedChange={setPushToEbay}
              disabled={!formData.sku}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Listing title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Listing description"
              rows={6}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => setFormData({ ...formData, currency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Available Stock</Label>
              <Input
                id="quantity"
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder="1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="SKU"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="ended">Ended</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image_url">Image URL</Label>
            <Input
              id="image_url"
              value={formData.image_url}
              onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
              placeholder="https://..."
            />
            {formData.image_url && (
              <img 
                src={formData.image_url} 
                alt="Preview" 
                className="w-20 h-20 object-cover rounded mt-2"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="listing_url">Listing URL</Label>
            <Input
              id="listing_url"
              value={formData.listing_url}
              onChange={(e) => setFormData({ ...formData, listing_url: e.target.value })}
              placeholder="https://www.ebay.com/..."
            />
          </div>

          {/* Metafields Section */}
          {hasShopify && metafieldDefs.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Shopify Metafields</Label>
                {loadingMetafields ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading metafield definitions...
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {metafieldDefs.map((def) => {
                      const nsKey = `${def.namespace}.${def.key}`;
                      return (
                        <div key={nsKey} className="space-y-1">
                          <Label className="text-xs">{def.name}</Label>
                          {def.description && (
                            <p className="text-xs text-muted-foreground">{def.description}</p>
                          )}
                          <Input
                            value={metafieldValues[nsKey] || ''}
                            onChange={(e) =>
                              setMetafieldValues((prev) => ({ ...prev, [nsKey]: e.target.value }))
                            }
                            placeholder={`${def.namespace}.${def.key} (${def.type})`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !formData.title}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ListingEditDialog;
