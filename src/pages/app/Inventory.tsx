import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  Plus, 
  Trash2, 
  Key, 
  Package, 
  Search, 
  Edit2,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  Boxes,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface InventoryItem {
  id: string;
  user_id: string;
  name: string;
  sku: string | null;
  description: string | null;
  delivery_message: string | null;
  download_url: string | null;
  auto_delivery_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface PlatformListing {
  id: string;
  user_id: string;
  inventory_item_id: string | null;
  platform: string;
  platform_listing_id: string;
  title: string | null;
  image_url: string | null;
  price: number | null;
  currency: string;
  status: string;
  created_at: string;
}

interface DigitalKey {
  id: string;
  user_id: string;
  inventory_item_id: string | null;
  listing_id: string;
  item_title: string | null;
  digital_key: string;
  download_url: string | null;
  status: string;
  order_id: string | null;
  platform: string | null;
  used_at: string | null;
  created_at: string;
}

const DEFAULT_MESSAGE = `Thank you for your purchase!

Here is your product key:
{KEY}

Download link:
{DOWNLOAD_URL}

If you have any questions, feel free to contact us.

Best regards`;

export default function Inventory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [listingSearchQuery, setListingSearchQuery] = useState<Record<string, string>>({});
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [newKeys, setNewKeys] = useState<Record<string, string>>({});
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  // New item form state
  const [newItemName, setNewItemName] = useState("");
  const [newItemSku, setNewItemSku] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemDeliveryMessage, setNewItemDeliveryMessage] = useState(DEFAULT_MESSAGE);
  const [newItemDownloadUrl, setNewItemDownloadUrl] = useState("");

  // Fetch inventory items
  const { data: inventoryItems, isLoading: itemsLoading } = useQuery({
    queryKey: ["inventory-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as InventoryItem[];
    },
    enabled: !!user,
  });

  // Fetch platform listings
  const { data: platformListings } = useQuery({
    queryKey: ["platform-listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_listings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PlatformListing[];
    },
    enabled: !!user,
  });

  // Fetch old-style listings (for migration/linking)
  const { data: legacyListings } = useQuery({
    queryKey: ["legacy-listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id, ebay_item_id, title, image_url, price, currency, status")
        .order("title");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch digital keys
  const { data: digitalKeys, isLoading: keysLoading } = useQuery({
    queryKey: ["digital-keys-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("digital_keys")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DigitalKey[];
    },
    enabled: !!user,
  });

  // Create inventory item
  const createItemMutation = useMutation({
    mutationFn: async (item: Partial<InventoryItem>) => {
      const { data, error } = await supabase
        .from("inventory_items")
        .insert({
          user_id: user!.id,
          name: item.name,
          sku: item.sku || null,
          description: item.description || null,
          delivery_message: item.delivery_message || DEFAULT_MESSAGE,
          download_url: item.download_url || null,
          auto_delivery_enabled: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      setIsCreateDialogOpen(false);
      resetNewItemForm();
      toast.success("Inventory item created");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Update inventory item
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<InventoryItem> & { id: string }) => {
      const { error } = await supabase
        .from("inventory_items")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      setEditingItem(null);
      toast.success("Item updated");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Delete inventory item
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      toast.success("Item deleted");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Add keys to inventory item
  const addKeysMutation = useMutation({
    mutationFn: async ({ inventoryItemId, keys, downloadUrl }: { inventoryItemId: string; keys: string[]; downloadUrl: string }) => {
      const item = inventoryItems?.find(i => i.id === inventoryItemId);
      const insertData = keys.map(key => ({
        user_id: user!.id,
        inventory_item_id: inventoryItemId,
        listing_id: inventoryItemId, // For backward compatibility
        item_title: item?.name || null,
        digital_key: key.trim(),
        download_url: downloadUrl || null,
      }));

      const { error } = await supabase.from("digital_keys").insert(insertData);
      if (error) throw error;
      return keys.length;
    },
    onSuccess: (count, { inventoryItemId }) => {
      queryClient.invalidateQueries({ queryKey: ["digital-keys-inventory"] });
      setNewKeys(prev => ({ ...prev, [inventoryItemId]: "" }));
      toast.success(`${count} key(s) added`);
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Delete digital key
  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase.from("digital_keys").delete().eq("id", keyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["digital-keys-inventory"] });
      toast.success("Key deleted");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Link listing to inventory item (handles both platform listings and legacy listings)
  const linkListingMutation = useMutation({
    mutationFn: async ({ inventoryItemId, listingData }: { 
      inventoryItemId: string; 
      listingData: { type: 'platform' | 'legacy'; id: string; listing?: any } 
    }) => {
      if (listingData.type === 'platform') {
        // Just update the existing platform_listing record
        const { error } = await supabase
          .from("platform_listings")
          .update({ inventory_item_id: inventoryItemId })
          .eq("id", listingData.id);
        if (error) throw error;
      } else {
        // Legacy eBay listing - create platform_listings entry
        const listing = listingData.listing;
        const existing = platformListings?.find(
          pl => pl.platform === 'ebay' && pl.platform_listing_id === listing.ebay_item_id
        );

        if (existing) {
          const { error } = await supabase
            .from("platform_listings")
            .update({ inventory_item_id: inventoryItemId })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("platform_listings")
            .insert({
              user_id: user!.id,
              inventory_item_id: inventoryItemId,
              platform: 'ebay',
              platform_listing_id: listing.ebay_item_id,
              title: listing.title,
              image_url: listing.image_url,
              price: listing.price,
              currency: listing.currency || 'EUR',
              status: listing.status || 'active',
            });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-listings"] });
      toast.success("Listing linked");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Unlink listing
  const unlinkListingMutation = useMutation({
    mutationFn: async (platformListingId: string) => {
      const { error } = await supabase
        .from("platform_listings")
        .update({ inventory_item_id: null })
        .eq("id", platformListingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-listings"] });
      toast.success("Listing unlinked");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const resetNewItemForm = () => {
    setNewItemName("");
    setNewItemSku("");
    setNewItemDescription("");
    setNewItemDeliveryMessage(DEFAULT_MESSAGE);
    setNewItemDownloadUrl("");
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const handleCreateItem = () => {
    if (!newItemName.trim()) {
      toast.error("Please enter a name");
      return;
    }
    createItemMutation.mutate({
      name: newItemName,
      sku: newItemSku,
      description: newItemDescription,
      delivery_message: newItemDeliveryMessage,
      download_url: newItemDownloadUrl,
    });
  };

  const handleAddKeys = (inventoryItemId: string) => {
    const keysText = newKeys[inventoryItemId] || "";
    const keys = keysText.split("\n").filter(k => k.trim());
    if (keys.length === 0) {
      toast.error("Please enter keys");
      return;
    }
    const item = inventoryItems?.find(i => i.id === inventoryItemId);
    addKeysMutation.mutate({
      inventoryItemId,
      keys,
      downloadUrl: item?.download_url || "",
    });
  };

  const getKeysForItem = (itemId: string) => {
    return digitalKeys?.filter(k => k.inventory_item_id === itemId) || [];
  };

  const getLinkedListings = (itemId: string) => {
    return platformListings?.filter(pl => pl.inventory_item_id === itemId) || [];
  };

  // Get all unlinked listings (from platform_listings table - includes both eBay and Shopify)
  const getUnlinkedPlatformListings = () => {
    return platformListings?.filter(pl => !pl.inventory_item_id) || [];
  };

  // Legacy eBay listings that haven't been migrated to platform_listings yet
  const getUnlinkedLegacyListings = () => {
    const linkedIds = new Set(platformListings?.map(pl => pl.platform_listing_id) || []);
    return legacyListings?.filter(l => !linkedIds.has(l.ebay_item_id)) || [];
  };

  // Combined unlinked listings for the dropdown
  const getAllUnlinkedListings = () => {
    const platformUnlinked = getUnlinkedPlatformListings().map(pl => ({
      id: pl.id,
      type: 'platform' as const,
      platform: pl.platform,
      title: pl.title || 'Untitled',
      image_url: pl.image_url,
      price: pl.price,
      currency: pl.currency,
      platformListingId: pl.platform_listing_id,
    }));
    
    const legacyUnlinked = getUnlinkedLegacyListings().map(l => ({
      id: l.id,
      type: 'legacy' as const,
      platform: 'ebay',
      title: l.title || 'Untitled',
      image_url: l.image_url,
      price: l.price,
      currency: l.currency,
      ebay_item_id: l.ebay_item_id,
    }));
    
    return [...platformUnlinked, ...legacyUnlinked];
  };

  const getPlatformLabel = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'ebay': return 'eBay';
      case 'shopify': return 'Shopify';
      default: return platform.charAt(0).toUpperCase() + platform.slice(1);
    }
  };

  const filteredItems = inventoryItems?.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Stats
  const totalItems = inventoryItems?.length || 0;
  const totalKeys = digitalKeys?.filter(k => k.inventory_item_id && k.status === 'available').length || 0;
  const totalUsedKeys = digitalKeys?.filter(k => k.inventory_item_id && k.status === 'used').length || 0;
  const linkedListingsCount = platformListings?.filter(pl => pl.inventory_item_id).length || 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">
            Manage your digital products and link them to platform listings
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Inventory Item</DialogTitle>
              <DialogDescription>
                Add a new digital product to your inventory. You can link platform listings and add keys later.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g., Windows 11 Pro License"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sku">SKU (optional)</Label>
                <Input
                  id="sku"
                  value={newItemSku}
                  onChange={(e) => setNewItemSku(e.target.value)}
                  placeholder="e.g., WIN11-PRO-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="download_url">Download URL (optional)</Label>
                <Input
                  id="download_url"
                  value={newItemDownloadUrl}
                  onChange={(e) => setNewItemDownloadUrl(e.target.value)}
                  placeholder="https://example.com/download"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery_message">Delivery Message</Label>
                <Textarea
                  id="delivery_message"
                  value={newItemDeliveryMessage}
                  onChange={(e) => setNewItemDeliveryMessage(e.target.value)}
                  placeholder="Message to send to buyer..."
                  rows={6}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{KEY}"} and {"{DOWNLOAD_URL}"} as placeholders.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateItem} disabled={createItemMutation.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products</CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Keys</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalKeys}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Used Keys</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsedKeys}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Linked Listings</CardTitle>
            <LinkIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{linkedListingsCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Inventory Items */}
      {itemsLoading ? (
        <p>Loading...</p>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Boxes className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No products yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first inventory item to start managing keys and linking listings.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredItems.map(item => {
            const isExpanded = expandedItems.has(item.id);
            const itemKeys = getKeysForItem(item.id);
            const availableKeys = itemKeys.filter(k => k.status === 'available');
            const usedKeys = itemKeys.filter(k => k.status === 'used');
            const linkedListings = getLinkedListings(item.id);

            return (
              <Card key={item.id}>
                <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(item.id)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <Package className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{item.name}</CardTitle>
                        <CardDescription className="flex items-center gap-4">
                          {item.sku && <span className="font-mono text-xs">{item.sku}</span>}
                          <Badge variant={availableKeys.length > 0 ? "default" : "secondary"}>
                            {availableKeys.length} keys available
                          </Badge>
                          <Badge variant="outline">{usedKeys.length} used</Badge>
                          {linkedListings.length > 0 && (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                              <LinkIcon className="h-3 w-3 mr-1" />
                              {linkedListings.length} listing{linkedListings.length > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 mr-4">
                          <Label htmlFor={`auto-${item.id}`} className="text-sm">
                            Auto-Delivery
                          </Label>
                          <Switch
                            id={`auto-${item.id}`}
                            checked={item.auto_delivery_enabled}
                            onCheckedChange={(checked) => 
                              updateItemMutation.mutate({ id: item.id, auto_delivery_enabled: checked })
                            }
                          />
                        </div>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="icon">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>
                  </CardHeader>

                  <CollapsibleContent>
                    <CardContent className="space-y-6 pt-4 border-t">
                      <div className="grid gap-6 md:grid-cols-2">
                        {/* Left Column - Settings & Keys */}
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Delivery Message</Label>
                            <Textarea
                              value={item.delivery_message || DEFAULT_MESSAGE}
                              onChange={(e) => updateItemMutation.mutate({ id: item.id, delivery_message: e.target.value })}
                              rows={6}
                              className="font-mono text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                              Use {"{KEY}"} and {"{DOWNLOAD_URL}"} as placeholders.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label>Download URL</Label>
                            <Input
                              value={item.download_url || ""}
                              onChange={(e) => updateItemMutation.mutate({ id: item.id, download_url: e.target.value })}
                              placeholder="https://example.com/download"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Add Keys</Label>
                            <Textarea
                              value={newKeys[item.id] || ""}
                              onChange={(e) => setNewKeys(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="One key per line..."
                              rows={4}
                              className="font-mono text-sm"
                            />
                            <Button
                              onClick={() => handleAddKeys(item.id)}
                              disabled={addKeysMutation.isPending || !newKeys[item.id]?.trim()}
                              size="sm"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Add Keys
                            </Button>
                          </div>
                        </div>

                        {/* Right Column - Linked Listings */}
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Linked Platform Listings</Label>
                            {linkedListings.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No listings linked yet.</p>
                            ) : (
                              <div className="space-y-2">
                                {linkedListings.map(pl => (
                                  <div key={pl.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                                    {pl.image_url && (
                                      <img src={pl.image_url} alt="" className="w-10 h-10 rounded object-cover" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">
                                        <span className="text-muted-foreground">{getPlatformLabel(pl.platform)} - </span>
                                        {pl.title}
                                      </p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => unlinkListingMutation.mutate(pl.id)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Link new listing */}
                            {(() => {
                              const allUnlinked = getAllUnlinkedListings();
                              const searchTerm = listingSearchQuery[item.id]?.toLowerCase() || '';
                              const filteredListings = allUnlinked.filter(l => 
                                l.title.toLowerCase().includes(searchTerm)
                              );
                              
                              if (allUnlinked.length === 0) return null;
                              
                              return (
                                <div className="mt-4 space-y-2">
                                  <Label>Link a Listing</Label>
                                  <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                      placeholder="Search listings..."
                                      value={listingSearchQuery[item.id] || ''}
                                      onChange={(e) => setListingSearchQuery(prev => ({ 
                                        ...prev, 
                                        [item.id]: e.target.value 
                                      }))}
                                      className="pl-9 mb-2"
                                    />
                                  </div>
                                  <Select
                                    onValueChange={(value) => {
                                      const [type, id] = value.split('::');
                                      if (type === 'platform') {
                                        linkListingMutation.mutate({ 
                                          inventoryItemId: item.id, 
                                          listingData: { type: 'platform', id } 
                                        });
                                      } else {
                                        const listing = legacyListings?.find(l => l.id === id);
                                        if (listing) {
                                          linkListingMutation.mutate({ 
                                            inventoryItemId: item.id, 
                                            listingData: { type: 'legacy', id, listing } 
                                          });
                                        }
                                      }
                                      setListingSearchQuery(prev => ({ ...prev, [item.id]: '' }));
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select a listing to link..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {filteredListings.length === 0 ? (
                                        <div className="py-2 px-3 text-sm text-muted-foreground">
                                          No listings found
                                        </div>
                                      ) : (
                                        filteredListings.map(listing => (
                                          <SelectItem 
                                            key={`${listing.type}::${listing.id}`} 
                                            value={`${listing.type}::${listing.id}`}
                                          >
                                            <span className="text-muted-foreground">{getPlatformLabel(listing.platform)} - </span>
                                            {listing.title}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Keys Table */}
                      {itemKeys.length > 0 && (
                        <div className="border rounded-lg">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Key</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Platform</TableHead>
                                <TableHead>Used At</TableHead>
                                <TableHead className="w-10"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {itemKeys.slice(0, 10).map(key => (
                                <TableRow key={key.id}>
                                  <TableCell className="font-mono text-sm">
                                    {key.digital_key.length > 40
                                      ? `${key.digital_key.substring(0, 40)}...`
                                      : key.digital_key}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={key.status === "available" ? "default" : "secondary"}>
                                      {key.status === "available" ? "Available" : "Used"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="capitalize">
                                    {key.platform || "-"}
                                  </TableCell>
                                  <TableCell>
                                    {key.used_at ? new Date(key.used_at).toLocaleDateString() : "-"}
                                  </TableCell>
                                  <TableCell>
                                    {key.status === "available" && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => deleteKeyMutation.mutate(key.id)}
                                      >
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          {itemKeys.length > 10 && (
                            <p className="text-sm text-muted-foreground text-center py-2">
                              Showing 10 of {itemKeys.length} keys
                            </p>
                          )}
                        </div>
                      )}

                      {/* Delete button */}
                      <div className="flex justify-end pt-4 border-t">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this product?")) {
                              deleteItemMutation.mutate(item.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Product
                        </Button>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
