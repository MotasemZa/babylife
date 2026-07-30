import { useState, useEffect } from 'react';
import { Search, ShoppingBag, Store, Loader2, Link2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface SourceListing {
  id: string;
  title: string;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  platform: 'ebay' | 'shopify';
  platformListingId: string; // ebay_item_id or platform_listing_id
  inventoryItemId?: string | null;
}

interface Candidate {
  id: string;
  title: string;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  platform: 'ebay' | 'shopify';
  platformListingId: string;
  inventoryItemId?: string | null;
}

interface LinkListingDialogProps {
  source: SourceListing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const LinkListingDialog = ({ source, open, onOpenChange, onSuccess }: LinkListingDialogProps) => {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<Candidate | null>(null);

  useEffect(() => {
    if (open && source && user) {
      loadCandidates();
      setSelected(null);
      setSearchTerm('');
    }
  }, [open, source, user]);

  const loadCandidates = async () => {
    if (!user || !source) return;
    setIsLoading(true);
    try {
      const results: Candidate[] = [];

      if (source.platform === 'ebay') {
        // Show Shopify listings that aren't already linked
        const { data, error } = await supabase
          .from('platform_listings')
          .select('*')
          .eq('user_id', user.id)
          .eq('platform', 'shopify')
          .is('inventory_item_id', null);

        if (error) throw error;
        (data || []).forEach(pl => {
          results.push({
            id: pl.id,
            title: pl.title || 'Untitled',
            price: pl.price,
            currency: pl.currency,
            image_url: pl.image_url,
            platform: 'shopify',
            platformListingId: pl.platform_listing_id,
          });
        });
      } else {
        // Show eBay listings that aren't already linked
        // Check which ebay_item_ids already have a platform_listing with inventory_item_id
        const { data: ebayPLs } = await supabase
          .from('platform_listings')
          .select('platform_listing_id')
          .eq('user_id', user.id)
          .eq('platform', 'ebay')
          .not('inventory_item_id', 'is', null);

        const linkedEbayIds = new Set((ebayPLs || []).map(p => p.platform_listing_id));

        const { data, error } = await supabase
          .from('listings')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;
        (data || []).forEach(l => {
          if (!linkedEbayIds.has(l.ebay_item_id)) {
            results.push({
              id: l.id,
              title: l.title,
              price: l.price,
              currency: l.currency,
              image_url: l.image_url,
              platform: 'ebay',
              platformListingId: l.ebay_item_id,
            });
          }
        });
      }

      setCandidates(results);
    } catch (error) {
      console.error('Error loading candidates:', error);
      toast.error('Failed to load listings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLink = async () => {
    if (!user || !source || !selected) return;
    setIsLinking(true);
    try {
      // Create an inventory_item to link them
      const { data: invItem, error: invError } = await supabase
        .from('inventory_items')
        .insert({
          user_id: user.id,
          name: source.title,
          auto_delivery_enabled: false,
        })
        .select()
        .single();

      if (invError) throw invError;

      const inventoryItemId = invItem.id;

      // Ensure source has a platform_listing entry
      if (source.platform === 'ebay') {
        // Upsert an ebay platform_listing entry
        await supabase.from('platform_listings').upsert({
          user_id: user.id,
          platform: 'ebay',
          platform_listing_id: source.platformListingId,
          title: source.title,
          price: source.price,
          currency: source.currency,
          image_url: source.image_url,
          inventory_item_id: inventoryItemId,
        }, { onConflict: 'user_id,platform,platform_listing_id' });
      } else {
        // Update existing shopify platform_listing
        await supabase
          .from('platform_listings')
          .update({ inventory_item_id: inventoryItemId })
          .eq('id', source.id);
      }

      // Link the selected candidate
      if (selected.platform === 'ebay') {
        await supabase.from('platform_listings').upsert({
          user_id: user.id,
          platform: 'ebay',
          platform_listing_id: selected.platformListingId,
          title: selected.title,
          price: selected.price,
          currency: selected.currency,
          image_url: selected.image_url,
          inventory_item_id: inventoryItemId,
        }, { onConflict: 'user_id,platform,platform_listing_id' });
      } else {
        await supabase
          .from('platform_listings')
          .update({ inventory_item_id: inventoryItemId })
          .eq('id', selected.id);
      }

      toast.success('Listings linked successfully!');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error linking:', error);
      toast.error('Failed to link listings');
    } finally {
      setIsLinking(false);
    }
  };

  const filtered = candidates.filter(c =>
    c.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const targetPlatform = source?.platform === 'ebay' ? 'Shopify' : 'eBay';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link to {targetPlatform} Listing
          </DialogTitle>
          <DialogDescription>
            Select a {targetPlatform} listing to pair with this product
          </DialogDescription>
        </DialogHeader>

        {/* Source listing preview */}
        {source && (
          <div className="p-3 bg-muted/50 rounded-lg flex items-center gap-3">
            {source.image_url && (
              <img src={source.image_url} alt="" className="w-10 h-10 object-cover rounded" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{source.title}</p>
              <p className="text-xs text-muted-foreground">{source.price ?? '—'} {source.currency || 'EUR'}</p>
            </div>
            <Badge variant="outline" className="text-xs gap-1">
              {source.platform === 'ebay' ? <ShoppingBag className="h-3 w-3" /> : <Store className="h-3 w-3" />}
              {source.platform === 'ebay' ? 'eBay' : 'Shopify'}
            </Badge>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${targetPlatform} listings...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Candidates list */}
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No unlinked {targetPlatform} listings found. Sync your {targetPlatform} listings first.
            </p>
          ) : (
            filtered.map(candidate => (
              <button
                key={candidate.id}
                onClick={() => setSelected(selected?.id === candidate.id ? null : candidate)}
                className={`w-full p-3 rounded-lg text-left flex items-center gap-3 transition-colors ${
                  selected?.id === candidate.id
                    ? 'bg-primary/10 border border-primary/30'
                    : 'bg-muted/30 hover:bg-muted/50 border border-transparent'
                }`}
              >
                {candidate.image_url && (
                  <img src={candidate.image_url} alt="" className="w-10 h-10 object-cover rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{candidate.title}</p>
                  <p className="text-xs text-muted-foreground">{candidate.price ?? '—'} {candidate.currency || 'EUR'}</p>
                </div>
                <Badge variant="outline" className="text-xs gap-1 shrink-0">
                  {candidate.platform === 'ebay' ? <ShoppingBag className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                  {candidate.platform === 'ebay' ? 'eBay' : 'Shopify'}
                </Badge>
              </button>
            ))
          )}
        </div>

        {/* Confirm */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleLink} disabled={!selected || isLinking}>
            {isLinking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
            Link Listings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LinkListingDialog;
