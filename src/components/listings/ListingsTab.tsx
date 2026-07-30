import { useState, useEffect } from 'react';
import { RefreshCw, Loader2, Package, Trash2, ExternalLink, Search, Pencil, Check, X, ShoppingBag, Store, ArrowRightLeft, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ebayService } from '@/services/ebayService';
import ListingEditDialog from './ListingEditDialog';
import CrossListDialog from './CrossListDialog';
import LinkListingDialog from './LinkListingDialog';

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
  raw_data?: any;
}

interface PlatformListing {
  id: string;
  platform: string;
  platform_listing_id: string;
  title: string | null;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  status: string | null;
  inventory_item_id: string | null;
  raw_data: any;
}

// Unified listing type for display
interface UnifiedListing {
  id: string;
  title: string;
  price: number | null;
  currency: string | null;
  quantity: number | null;
  image_url: string | null;
  status: string | null;
  platforms: ('ebay' | 'shopify')[];
  ebayListing?: Listing;
  shopifyListing?: PlatformListing;
  inventoryItemId?: string | null;
  sku?: string | null;
  listingUrl?: string | null;
}

type PlatformFilter = 'all' | 'ebay' | 'shopify';

const ListingsTab = () => {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [platformListings, setPlatformListings] = useState<PlatformListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncingPlatform, setSyncingPlatform] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [fullEditListing, setFullEditListing] = useState<Listing | null>(null);
  const [crossListListing, setCrossListListing] = useState<Listing | null>(null);
  const [linkSource, setLinkSource] = useState<any>(null);
  const [ebayConnected, setEbayConnected] = useState(false);
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [connectionsLoading, setConnectionsLoading] = useState(true);

  // Check platform connections
  useEffect(() => {
    let isMounted = true;

    const checkConnections = async () => {
      if (!user) {
        if (isMounted) {
          setEbayConnected(false);
          setShopifyConnected(false);
          setConnectionsLoading(false);
        }
        return;
      }

      setConnectionsLoading(true);
      try {
        const [ebayStatus, shopifyStatus] = await Promise.all([
          ebayService.checkConnectionStatus(),
          (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return { connected: false };
            const res = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-auth?action=check-status`,
              {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            if (!res.ok) return { connected: false };
            return (await res.json()) as { connected: boolean };
          })(),
        ]);

        if (!isMounted) return;
        setEbayConnected(!!ebayStatus.connected);
        setShopifyConnected(!!shopifyStatus.connected);
      } catch {
        if (!isMounted) return;
        setEbayConnected(false);
        setShopifyConnected(false);
      } finally {
        if (isMounted) setConnectionsLoading(false);
      }
    };

    checkConnections();
    const handleFocus = () => checkConnections();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [user]);

  // Load ALL listings (both platforms) at once
  const loadAllListings = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [ebayRes, shopifyRes] = await Promise.all([
        supabase.from('listings').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
        supabase.from('platform_listings').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      ]);

      if (ebayRes.error) throw ebayRes.error;
      if (shopifyRes.error) throw shopifyRes.error;

      setListings(ebayRes.data || []);
      setPlatformListings(shopifyRes.data || []);
    } catch (error) {
      console.error('Error loading listings:', error);
      toast.error('Failed to load listings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllListings();
  }, [user]);

  // Build unified listing list
  const buildUnifiedListings = (): UnifiedListing[] => {
    const unified: UnifiedListing[] = [];
    const shopifyByItemId = new Map<string, PlatformListing>();
    const usedShopifyIds = new Set<string>();

    // Index shopify listings by platform_listing_id for cross-reference
    // Also try matching by inventory_item_id
    const shopifyByInvId = new Map<string, PlatformListing>();
    platformListings.forEach(pl => {
      if (pl.platform === 'shopify') {
        if (pl.inventory_item_id) {
          shopifyByInvId.set(pl.inventory_item_id, pl);
        }
      }
    });

    // eBay platform listings that might share inventory_item_id
    const ebayPlatformListings = platformListings.filter(pl => pl.platform === 'ebay');
    const ebayPLByListingId = new Map<string, PlatformListing>();
    ebayPlatformListings.forEach(pl => {
      ebayPLByListingId.set(pl.platform_listing_id, pl);
    });

    // Process eBay listings
    listings.forEach(ebay => {
      const platforms: ('ebay' | 'shopify')[] = ['ebay'];
      let shopifyMatch: PlatformListing | undefined;

      // Check if this eBay listing has a platform_listing entry with inventory_item_id
      const ebayPL = ebayPLByListingId.get(ebay.ebay_item_id);
      if (ebayPL?.inventory_item_id) {
        const shopify = shopifyByInvId.get(ebayPL.inventory_item_id);
        if (shopify) {
          platforms.push('shopify');
          shopifyMatch = shopify;
          usedShopifyIds.add(shopify.id);
        }
      }

      unified.push({
        id: ebay.id,
        title: ebay.title,
        price: ebay.price,
        currency: ebay.currency,
        quantity: ebay.quantity,
        image_url: ebay.image_url,
        status: ebay.status,
        platforms,
        ebayListing: ebay,
        shopifyListing: shopifyMatch,
        inventoryItemId: ebayPL?.inventory_item_id,
        sku: ebay.sku,
        listingUrl: ebay.listing_url,
      });
    });

    // Add Shopify-only listings (not already paired)
    platformListings
      .filter(pl => pl.platform === 'shopify' && !usedShopifyIds.has(pl.id))
      .forEach(shopify => {
        unified.push({
          id: shopify.id,
          title: shopify.title || 'Untitled',
          price: shopify.price,
          currency: shopify.currency,
          quantity: null,
          image_url: shopify.image_url,
          status: shopify.status,
          platforms: ['shopify'],
          shopifyListing: shopify,
          inventoryItemId: shopify.inventory_item_id,
        });
      });

    return unified;
  };

  const unifiedListings = buildUnifiedListings();

  // Filter
  const filteredListings = unifiedListings.filter(listing => {
    const matchesSearch = listing.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      listing.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlatform = platformFilter === 'all' ||
      (platformFilter === 'ebay' && listing.platforms.includes('ebay')) ||
      (platformFilter === 'shopify' && listing.platforms.includes('shopify'));
    return matchesSearch && matchesPlatform;
  });

  // Sync functions
  const syncFromEbay = async () => {
    if (!user) return;
    setIsSyncing(true);
    setSyncingPlatform('ebay');
    setSyncProgress(0);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Session expired'); return; }

      let allListings: any[] = [];
      let pageNumber = 1;
      let hasMore = true;
      let total = 0;

      while (hasMore) {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ebay-fetch-listings`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ pageNumber, limit: 100 }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed: ${response.status}`);
        }

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        allListings = [...allListings, ...(data.listings || [])];
        total = data.total || allListings.length;
        hasMore = data.hasMore || false;
        pageNumber = data.nextPageNumber || pageNumber + 1;
        setSyncProgress(Math.min(90, Math.round((allListings.length / Math.max(total, 1)) * 90)));
      }

      const listingsToUpsert = allListings.map(l => ({
        user_id: user.id,
        ebay_item_id: l.itemId,
        title: l.title,
        description: l.description || null,
        price: l.price ? parseFloat(l.price.replace(/[^0-9.,]/g, '').replace(',', '.')) : null,
        currency: l.currency || 'EUR',
        quantity: l.quantity,
        sku: l.sku,
        image_url: l.imageUrls?.[0] || null,
        listing_url: l.viewItemURL || null,
        status: l.listingStatus || 'active',
        start_time: l.startTime || null,
        raw_data: l.raw,
      }));

      setSyncProgress(95);
      const { error } = await supabase.from('listings').upsert(listingsToUpsert, { onConflict: 'user_id,ebay_item_id', ignoreDuplicates: false });
      if (error) throw error;

      setSyncProgress(100);
      toast.success(`Synced ${allListings.length} eBay listings`);
      await loadAllListings();
    } catch (error) {
      console.error('eBay sync error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to sync');
    } finally {
      setIsSyncing(false);
      setSyncingPlatform(null);
    }
  };

  const syncFromShopify = async () => {
    if (!user) return;
    setIsSyncing(true);
    setSyncingPlatform('shopify');
    setSyncProgress(30);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Session expired'); return; }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-fetch-listings`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        }
      );
      setSyncProgress(60);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const shopifyListings = data.listings || [];
      const toUpsert = shopifyListings.map((l: any) => ({
        user_id: user.id,
        platform: 'shopify',
        platform_listing_id: l.platformListingId,
        title: l.title,
        price: l.price,
        currency: l.currency || 'USD',
        image_url: l.imageUrl,
        status: l.status,
        raw_data: l.raw,
      }));

      setSyncProgress(90);
      const { error } = await supabase.from('platform_listings').upsert(toUpsert, { onConflict: 'user_id,platform,platform_listing_id', ignoreDuplicates: false });
      if (error) throw error;

      setSyncProgress(100);
      toast.success(`Synced ${shopifyListings.length} Shopify listings`);
      await loadAllListings();
    } catch (error) {
      console.error('Shopify sync error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to sync');
    } finally {
      setIsSyncing(false);
      setSyncingPlatform(null);
    }
  };

  // Delete
  const deleteListing = async (listing: UnifiedListing) => {
    try {
      if (listing.ebayListing) {
        const { error } = await supabase.from('listings').delete().eq('id', listing.ebayListing.id);
        if (error) throw error;
      }
      if (listing.shopifyListing) {
        const { error } = await supabase.from('platform_listings').delete().eq('id', listing.shopifyListing.id);
        if (error) throw error;
      }
      await loadAllListings();
      toast.success('Listing removed');
    } catch (error) {
      toast.error('Failed to delete listing');
    }
  };

  // Quick edit (eBay only)
  const startEditing = (listing: UnifiedListing) => {
    if (!listing.ebayListing) return;
    setEditingId(listing.id);
    setEditPrice(listing.price?.toString() || '');
    setEditQuantity(listing.quantity?.toString() || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditPrice('');
    setEditQuantity('');
  };

  const saveQuickEdit = async (listing: UnifiedListing) => {
    if (!listing.ebayListing) return;
    setIsSaving(true);
    try {
      const newPrice = editPrice ? parseFloat(editPrice) : null;
      const newQuantity = editQuantity ? parseInt(editQuantity) : null;

      const { error } = await supabase
        .from('listings')
        .update({ price: newPrice, quantity: newQuantity, updated_at: new Date().toISOString() })
        .eq('id', listing.ebayListing.id);
      if (error) throw error;

      // Push to eBay
      if (listing.ebayListing.sku) {
        const { data, error: invokeError } = await supabase.functions.invoke('ebay-update-listing', {
          body: {
            updates: [{
              sku: listing.ebayListing.sku,
              itemId: listing.ebayListing.ebay_item_id,
              price: newPrice ?? undefined,
              quantity: newQuantity ?? undefined,
              currency: listing.currency || 'EUR',
            }],
          },
        });
        if (invokeError) toast.error(`eBay: ${invokeError.message}`);
        else if (data?.summary?.failed > 0) toast.error(`eBay: ${data?.results?.[0]?.error || 'Update failed'}`);
        else toast.success('Updated on eBay');
      } else {
        toast.error('SKU missing: cannot update on eBay');
      }

      await loadAllListings();
      cancelEditing();
    } catch (error) {
      toast.error('Failed to update listing');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFullEditSave = (updatedListing: Listing) => {
    setListings(prev => prev.map(l => l.id === updatedListing.id ? updatedListing : l));
    setFullEditListing(null);
  };

  const anyConnected = ebayConnected || shopifyConnected;
  const hasAnyListings = listings.length > 0 || platformListings.length > 0;

  return (
    <div className="space-y-6 mt-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                All Listings
              </CardTitle>
              <CardDescription>
                {listings.length} eBay · {platformListings.filter(p => p.platform === 'shopify').length} Shopify
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {ebayConnected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncFromEbay}
                  disabled={isSyncing}
                >
                  {isSyncing && syncingPlatform === 'ebay' ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <ShoppingBag className="h-4 w-4 mr-1" />
                  )}
                  Sync eBay
                </Button>
              )}
              {shopifyConnected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncFromShopify}
                  disabled={isSyncing}
                >
                  {isSyncing && syncingPlatform === 'shopify' ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Store className="h-4 w-4 mr-1" />
                  )}
                  Sync Shopify
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSyncing && (
            <div className="space-y-2">
              <Progress value={syncProgress} />
              <p className="text-sm text-muted-foreground text-center">
                Syncing {syncingPlatform}... {syncProgress}%
              </p>
            </div>
          )}

          {!connectionsLoading && !anyConnected && !hasAnyListings && (
            <div className="bg-muted/50 border border-dashed rounded-lg p-6 text-center">
              <p className="text-muted-foreground mb-3">No platforms connected. Connect eBay or Shopify to start syncing listings.</p>
              <Button variant="outline" size="sm" asChild>
                <a href="/app/imports">Connect Platforms</a>
              </Button>
            </div>
          )}

          {(anyConnected || hasAnyListings) && (
            <>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by title or SKU..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as PlatformFilter)}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="ebay">eBay</SelectItem>
                    <SelectItem value="shopify">Shopify</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredListings.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {!hasAnyListings ? 'No listings yet. Sync from eBay or Shopify above.' : 'No listings match your search.'}
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {filteredListings.map((listing) => (
                    <div key={listing.id} className="p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {listing.image_url && (
                          <img src={listing.image_url} alt="" className="w-12 h-12 object-cover rounded" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{listing.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {listing.sku && <span className="text-xs text-muted-foreground">SKU: {listing.sku}</span>}
                          </div>
                        </div>

                        {/* Platform badges */}
                        <div className="flex items-center gap-1">
                          {listing.platforms.includes('ebay') && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <ShoppingBag className="h-3 w-3" />
                              eBay
                            </Badge>
                          )}
                          {listing.platforms.includes('shopify') && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Store className="h-3 w-3" />
                              Shopify
                            </Badge>
                          )}
                          {listing.platforms.length > 1 && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Link2 className="h-3 w-3" />
                              Synced
                            </Badge>
                          )}
                        </div>

                        <Badge variant={listing.status === 'active' ? 'default' : 'secondary'}>
                          {listing.status || 'Active'}
                        </Badge>

                        <div className="flex items-center gap-1">
                          {listing.listingUrl && (
                            <Button variant="ghost" size="icon" onClick={() => window.open(listing.listingUrl!, '_blank')}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          {listing.ebayListing && (
                            <Button variant="ghost" size="icon" onClick={() => setFullEditListing(listing.ebayListing!)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {/* Cross-list button: eBay-only → Shopify */}
                          {listing.platforms.length === 1 && listing.platforms[0] === 'ebay' && shopifyConnected && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Cross-list to Shopify"
                              onClick={() => setCrossListListing(listing.ebayListing!)}
                            >
                              <ArrowRightLeft className="h-4 w-4" />
                            </Button>
                          )}
                          {/* Link button: connect to listing on another platform */}
                          {listing.platforms.length === 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Link to listing on another platform"
                              onClick={() => {
                                const platform = listing.platforms[0];
                                setLinkSource({
                                  id: platform === 'ebay' ? listing.ebayListing!.id : listing.shopifyListing!.id,
                                  title: listing.title,
                                  price: listing.price,
                                  currency: listing.currency,
                                  image_url: listing.image_url,
                                  platform,
                                  platformListingId: platform === 'ebay'
                                    ? listing.ebayListing!.ebay_item_id
                                    : listing.shopifyListing!.platform_listing_id,
                                  inventoryItemId: listing.inventoryItemId,
                                });
                              }}
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => deleteListing(listing)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {/* Quick edit row */}
                      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50">
                        {editingId === listing.id && listing.ebayListing ? (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Price:</span>
                              <Input type="number" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-24 h-8" placeholder="0.00" />
                              <span className="text-sm text-muted-foreground">{listing.currency || 'EUR'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Stock:</span>
                              <Input type="number" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} className="w-20 h-8" placeholder="0" />
                            </div>
                            <div className="flex items-center gap-1 ml-auto">
                              <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={isSaving}>
                                <X className="h-4 w-4" />
                              </Button>
                              <Button size="sm" onClick={() => saveQuickEdit(listing)} disabled={isSaving}>
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-sm">
                              <span className="text-muted-foreground">Price:</span>{' '}
                              <span className="font-medium">{listing.price ?? '—'} {listing.currency || 'EUR'}</span>
                            </span>
                            <span className="text-sm">
                              <span className="text-muted-foreground">Stock:</span>{' '}
                              <span className="font-medium">{listing.quantity ?? '—'}</span>
                            </span>
                            {listing.ebayListing && (
                              <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => startEditing(listing)}>
                                Quick Edit
                              </Button>
                            )}
                            {listing.platforms.length === 1 && listing.platforms[0] === 'ebay' && shopifyConnected && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => setCrossListListing(listing.ebayListing!)}
                              >
                                <ArrowRightLeft className="h-3 w-3" />
                                Cross-list
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Full edit dialog (eBay) */}
      <ListingEditDialog
        listing={fullEditListing}
        open={!!fullEditListing}
        onOpenChange={(open) => !open && setFullEditListing(null)}
        onSave={handleFullEditSave}
        platforms={fullEditListing ? (unifiedListings.find(u => u.ebayListing?.id === fullEditListing.id)?.platforms || []) : []}
        shopifyRawData={fullEditListing ? (unifiedListings.find(u => u.ebayListing?.id === fullEditListing.id)?.shopifyListing?.raw_data) : undefined}
      />

      {/* Cross-list dialog */}
      <CrossListDialog
        listing={crossListListing}
        open={!!crossListListing}
        onOpenChange={(open) => !open && setCrossListListing(null)}
        onSuccess={() => loadAllListings()}
      />

      {/* Link listing dialog */}
      <LinkListingDialog
        source={linkSource}
        open={!!linkSource}
        onOpenChange={(open) => !open && setLinkSource(null)}
        onSuccess={() => loadAllListings()}
      />
    </div>
  );
};

export default ListingsTab;
