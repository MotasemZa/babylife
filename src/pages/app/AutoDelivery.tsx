import { useState, useEffect, useCallback, useRef } from "react";
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
  Key, 
  Package, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  Power,
  Play,
  Zap,
  FileText,
  MessageCircle,
  XCircle,
  Boxes,
  Plus,
  Trash2,
  Copy,
  Search,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  X,
  Mail,
  FileText as FileTextIcon,
  MinusCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { SetupGuide } from "@/components/auto-delivery/SetupGuide";
import { FulfillmentDetailSheet } from "@/components/auto-delivery/FulfillmentDetailSheet";
import { useSetupProgress } from "@/hooks/useSetupProgress";

type ShopifyWebhookInstallState =
  | { state: "idle" }
  | { state: "installed"; note?: string }
  | { state: "needs_reconnect"; details?: string }
  | { state: "error"; details?: string };

interface FulfillmentLog {
  id: string;
  user_id: string;
  order_id: string;
  listing_id: string | null;
  inventory_item_id: string | null;
  digital_key_id: string | null;
  platform: string | null;
  item_title: string | null;
  buyer_username: string | null;
  buyer_email: string | null;
  status: string;
  message_sent: boolean;
  message_body: string | null;
  message_error: string | null;
  invoice_sent: boolean;
  invoice_error: string | null;
  marked_fulfilled: boolean;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

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

export default function AutoDelivery() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const productsRef = useRef<HTMLDivElement>(null);
  
  // Auto-delivery state
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [shopifyWebhookState, setShopifyWebhookState] = useState<ShopifyWebhookInstallState>({ state: "idle" });
  
  // Inventory state
  const [searchQuery, setSearchQuery] = useState("");
  const [listingSearchQuery, setListingSearchQuery] = useState<Record<string, string>>({});
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [newKeys, setNewKeys] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  
  // New item form state
  const [newItemName, setNewItemName] = useState("");
  const [newItemSku, setNewItemSku] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemDeliveryMessage, setNewItemDeliveryMessage] = useState(DEFAULT_MESSAGE);
  const [newItemDownloadUrl, setNewItemDownloadUrl] = useState("");

  // Fulfillment detail sheet state
  const [selectedLog, setSelectedLog] = useState<FulfillmentLog | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  

  // Get setup progress for conditional disable
  const setupProgress = useSetupProgress();

  // Fetch user settings including email options
  const { data: userSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["user-settings-auto-delivery"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("auto_delivery_enabled, auto_send_invoice")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const globalAutoDeliveryEnabled = userSettings?.auto_delivery_enabled ?? true;
  const autoSendInvoice = userSettings?.auto_send_invoice ?? true;

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
  const { data: digitalKeys } = useQuery({
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

  // Fetch fulfillment logs
  const { data: fulfillmentLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["fulfillment-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fulfillment_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as FulfillmentLog[];
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
  });

  // Fetch Shopify pending orders
  const { data: shopifyPendingOrders, refetch: refetchShopifyOrders } = useQuery({
    queryKey: ["shopify-pending-orders"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("shopify-fetch-orders", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { action: "fetch" },
      });
      if (response.error) {
        console.log("Shopify not connected or error:", response.error);
        return [];
      }
      return response.data?.orders || [];
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });

  // Fetch fulfilled eBay orders
  const { data: fulfilledEbayOrders } = useQuery({
    queryKey: ["fulfilled-ebay-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("order_id, raw_data")
        .eq("type", "sale")
        .not("order_id", "is", null);
      if (error) throw error;
      return data?.filter(t => {
        const rawData = t.raw_data as Record<string, unknown> | null;
        return rawData?.orderFulfillmentStatus === "FULFILLED";
      }).map(t => t.order_id) || [];
    },
    enabled: !!user,
  });

  const installShopifyWebhook = useCallback(async () => {
    if (!user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-auth?action=install-webhook`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      const data = await res.json();

      if (!res.ok) {
        setShopifyWebhookState({ state: "error", details: data?.error || res.statusText });
        return;
      }

      const needsReconnect = Boolean(data?.needsReconnect);
      const success = Boolean(data?.success);

      if (success) {
        setShopifyWebhookState({ state: "installed", note: data?.details });
        return;
      }

      if (needsReconnect) {
        setShopifyWebhookState({ state: "needs_reconnect", details: data?.details });
        return;
      }

      setShopifyWebhookState({ state: "error", details: data?.details || "Unable to install webhook" });
    } catch (e: any) {
      setShopifyWebhookState({ state: "error", details: e?.message || String(e) });
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    installShopifyWebhook();
  }, [user?.id]);

  const triggerAutoFulfill = useCallback(async (silent = false) => {
    if (!silent) setIsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const [ebayResponse, shopifyResponse] = await Promise.all([
        supabase.functions.invoke("ebay-auto-fulfill", {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        }),
        supabase.functions.invoke("shopify-auto-fulfill", {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        }).catch(err => {
          console.log("Shopify auto-fulfill failed (may not be connected):", err);
          return { data: null, error: err };
        }),
      ]);

      if (ebayResponse.error && shopifyResponse.error) {
        throw ebayResponse.error || shopifyResponse.error;
      }

      queryClient.invalidateQueries({ queryKey: ["fulfillment-logs"] });
      queryClient.invalidateQueries({ queryKey: ["digital-keys-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["shopify-pending-orders"] });
      setLastRefresh(new Date());

      const ebayResults = ebayResponse.data?.results || [];
      const shopifyResults = shopifyResponse.data?.results || [];
      const ebayOrdersProcessed = ebayResults.reduce((sum: number, r: any) => sum + (r.ordersProcessed || 0), 0);
      const shopifyOrdersProcessed = shopifyResults.reduce((sum: number, r: any) => sum + (r.ordersProcessed || 0), 0);

      if (!silent) {
        const total = ebayOrdersProcessed + shopifyOrdersProcessed;
        if (total > 0) {
          const parts = [];
          if (ebayOrdersProcessed > 0) parts.push(`${ebayOrdersProcessed} eBay`);
          if (shopifyOrdersProcessed > 0) parts.push(`${shopifyOrdersProcessed} Shopify`);
          toast.success(`Fulfilled: ${parts.join(", ")} order(s)`);
        } else {
          toast.info("No new paid orders found");
        }
      }
    } catch (error: any) {
      if (!silent) toast.error(`Error: ${error.message}`);
    } finally {
      if (!silent) setIsProcessing(false);
    }
  }, [queryClient]);

  // Safety sweep polling
  useEffect(() => {
    const intervalMs = 30 * 1000;

    const tick = () => {
      if (!globalAutoDeliveryEnabled) return;
      if (document.visibilityState !== "visible") return;
      triggerAutoFulfill(true);
      setLastRefresh(new Date());
    };

    const interval = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [globalAutoDeliveryEnabled, triggerAutoFulfill]);

  const manualFulfillOrder = async (orderId: string, isRetry = false, platform = 'ebay') => {
    setProcessingOrderId(orderId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const functionName = platform === 'shopify' ? 'shopify-auto-fulfill' : 'ebay-auto-fulfill';
      const response = await supabase.functions.invoke(functionName, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { orderId, forceManual: true },
      });

      if (response.error) throw response.error;

      queryClient.invalidateQueries({ queryKey: ["fulfillment-logs"] });
      queryClient.invalidateQueries({ queryKey: ["digital-keys-inventory"] });
      toast.success(isRetry ? "Order retry completed" : "Order fulfilled");
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setProcessingOrderId(null);
    }
  };

  const toggleGlobalAutoDelivery = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("user_settings")
        .update({ auto_delivery_enabled: enabled })
        .eq("user_id", user!.id);
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ["user-settings-auto-delivery"] });
      toast.success(enabled ? "Auto-Delivery enabled" : "Auto-Delivery disabled");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const toggleInvoiceAutoSend = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("user_settings")
        .update({ auto_send_invoice: enabled })
        .eq("user_id", user!.id);
      if (error) throw error;
      return enabled;
    },
    onMutate: async (enabled) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["user-settings-auto-delivery"] });
      // Snapshot previous value
      const previousSettings = queryClient.getQueryData(["user-settings-auto-delivery"]);
      // Optimistically update
      queryClient.setQueryData(["user-settings-auto-delivery"], (old: any) => ({
        ...old,
        auto_send_invoice: enabled,
      }));
      return { previousSettings };
    },
    onError: (error, _, context) => {
      // Rollback on error
      if (context?.previousSettings) {
        queryClient.setQueryData(["user-settings-auto-delivery"], context.previousSettings);
      }
      toast.error(`Error: ${error.message}`);
    },
    onSuccess: (enabled) => {
      toast.success(enabled ? "Invoice auto-send enabled" : "Invoice auto-send disabled");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings-auto-delivery"] });
    },
  });


  // Inventory mutations
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

  const duplicateItemMutation = useMutation({
    mutationFn: async (item: InventoryItem) => {
      const { data, error } = await supabase
        .from("inventory_items")
        .insert({
          user_id: user!.id,
          name: `${item.name} (Copy)`,
          sku: item.sku || null,
          description: item.description || null,
          delivery_message: item.delivery_message || DEFAULT_MESSAGE,
          download_url: item.download_url || null,
          auto_delivery_enabled: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      toast.success("Product duplicated");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

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
      toast.success("Item updated");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("inventory_items")
        .delete()
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      queryClient.invalidateQueries({ queryKey: ["digital-keys-inventory"] });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      toast.success("Products deleted");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const addKeysMutation = useMutation({
    mutationFn: async ({ inventoryItemId, keys, downloadUrl }: { inventoryItemId: string; keys: string[]; downloadUrl: string }) => {
      const item = inventoryItems?.find(i => i.id === inventoryItemId);
      const insertData = keys.map(key => ({
        user_id: user!.id,
        inventory_item_id: inventoryItemId,
        listing_id: inventoryItemId,
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

  const linkListingMutation = useMutation({
    mutationFn: async ({ inventoryItemId, listingData }: { 
      inventoryItemId: string; 
      listingData: { type: 'platform' | 'legacy'; id: string; listing?: any } 
    }) => {
      if (listingData.type === 'platform') {
        const { error } = await supabase
          .from("platform_listings")
          .update({ inventory_item_id: inventoryItemId })
          .eq("id", listingData.id);
        if (error) throw error;
      } else {
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

  const getUnlinkedPlatformListings = () => {
    return platformListings?.filter(pl => !pl.inventory_item_id) || [];
  };

  const getUnlinkedLegacyListings = () => {
    const linkedIds = new Set(platformListings?.map(pl => pl.platform_listing_id) || []);
    return legacyListings?.filter(l => !linkedIds.has(l.ebay_item_id)) || [];
  };

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
      case "completed":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
      case "processing":
        return <Badge className="bg-blue-500"><Clock className="w-3 h-3 mr-1" /> Processing</Badge>;
      case "failed":
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case "partial":
        return <Badge className="bg-yellow-500"><AlertCircle className="w-3 h-3 mr-1" /> Partial</Badge>;
      case "skipped":
        return <Badge variant="secondary"><MinusCircle className="w-3 h-3 mr-1" /> Skipped</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Calculate stats
  const totalAvailable = digitalKeys?.filter(k => k.status === 'available').length || 0;
  const totalUsed = digitalKeys?.filter(k => k.status === 'used').length || 0;
  const enabledProducts = inventoryItems?.filter(i => i.auto_delivery_enabled).length || 0;

  const successfulOrderIds = new Set(
    fulfillmentLogs?.filter(l => l.status === "success" || l.status === "completed").map(l => l.order_id) || []
  );
  const fulfilledOnEbayOrderIds = new Set(fulfilledEbayOrders || []);
  
  const pendingLogsFiltered = fulfillmentLogs?.filter(l => 
    (l.status === "failed" || l.status === "processing") && 
    !successfulOrderIds.has(l.order_id) &&
    !fulfilledOnEbayOrderIds.has(l.order_id) &&
    !(l.error_message && l.error_message.toLowerCase().includes("not linked to any inventory item"))
  ) || [];
  
  const seenOrderIds = new Set<string>();
  const pendingOrders = pendingLogsFiltered.filter(log => {
    if (seenOrderIds.has(log.order_id)) {
      return false;
    }
    seenOrderIds.add(log.order_id);
    return true;
  });

  const shopifyPending = (shopifyPendingOrders || []).map((order: any) => ({
    id: `shopify-${order.id}`,
    order_id: String(order.id),
    platform: 'shopify',
    item_title: order.line_items?.[0]?.title || 'Unknown Item',
    buyer_username: order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Unknown',
    buyer_email: order.email,
    status: 'pending',
    error_message: null,
    created_at: order.created_at,
    line_items: order.line_items,
  }));

  const allPendingOrders = [...pendingOrders, ...shopifyPending];
  const successfulFulfillments = fulfillmentLogs?.filter(l => l.status === "success" || l.status === "completed").length || 0;

  const filteredItems = inventoryItems?.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Determine default tab based on setup completion
  const hasProducts = (inventoryItems?.length || 0) > 0;
  const hasKeys = totalAvailable > 0;
  const defaultTab = setupProgress.allComplete ? "products" : (hasProducts && hasKeys ? "pending" : "guide");
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Auto-Delivery</h1>
          <p className="text-sm text-muted-foreground">
            Manage your digital products and automated fulfillment
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

      {/* Header Controls */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Last check: {lastRefresh.toLocaleTimeString()}
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Auto-Delivery Toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-muted ${!setupProgress.canEnableAutoDelivery && 'opacity-60'}`}>
                    <Power className={`h-4 w-4 ${globalAutoDeliveryEnabled ? 'text-success' : 'text-muted-foreground'}`} />
                    <Label htmlFor="global-auto" className="text-sm font-medium hidden sm:inline">
                      Auto-Delivery
                    </Label>
                    <Switch
                      id="global-auto"
                      checked={globalAutoDeliveryEnabled}
                      onCheckedChange={(checked) => toggleGlobalAutoDelivery.mutate(checked)}
                      disabled={!setupProgress.canEnableAutoDelivery || toggleGlobalAutoDelivery.isPending || settingsLoading}
                    />
                  </div>
                </TooltipTrigger>
                {!setupProgress.canEnableAutoDelivery && (
                  <TooltipContent>
                    <p>Complete all setup steps to enable auto-delivery</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            {/* Invoice Auto-Send Toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
                    <FileTextIcon className={`h-4 w-4 ${autoSendInvoice ? 'text-success' : 'text-muted-foreground'}`} />
                    <Label htmlFor="invoice-auto" className="text-sm font-medium hidden sm:inline">
                      Invoices
                    </Label>
                    <Switch
                      id="invoice-auto"
                      checked={autoSendInvoice}
                      onCheckedChange={(checked) => toggleInvoiceAutoSend.mutate(checked)}
                      disabled={toggleInvoiceAutoSend.isPending || settingsLoading}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Auto-send invoices after successful fulfillment</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button onClick={() => triggerAutoFulfill(false)} disabled={isProcessing} size="sm" className="sm:size-default">
              <RefreshCw className={`w-4 h-4 mr-2 ${isProcessing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Check Now</span>
              <span className="sm:hidden">Check</span>
            </Button>
          </div>
        </div>
      </div>

      {shopifyWebhookState.state === "needs_reconnect" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shopify instant fulfillment isn't enabled yet</CardTitle>
            <CardDescription>
              Your Shopify connection likely predates the webhook permission. Reconnect Shopify to enable instant paid-order triggers.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link to="/app/imports">Reconnect Shopify</Link>
            </Button>
            <Button variant="secondary" onClick={() => installShopifyWebhook()}>
              Try install again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Products</CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{enabledProducts}</div>
            <p className="text-xs text-muted-foreground">with Auto-Delivery</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Keys</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAvailable}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Used Keys</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fulfilled</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successfulFulfillments}</div>
          </CardContent>
        </Card>
        <Card className={allPendingOrders.length > 0 ? "border-yellow-500" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allPendingOrders.length}</div>
            <p className="text-xs text-muted-foreground">needs attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full sm:w-auto flex-wrap h-auto gap-1 p-1">
          {!setupProgress.allComplete && (
            <TabsTrigger value="guide" className="text-xs sm:text-sm">Setup</TabsTrigger>
          )}
          <TabsTrigger value="products" className="text-xs sm:text-sm">Products</TabsTrigger>
          <TabsTrigger value="pending" className="relative text-xs sm:text-sm">
            <span className="hidden sm:inline">Pending Orders</span>
            <span className="sm:hidden">Pending</span>
            {allPendingOrders.length > 0 && (
              <Badge className="ml-1 sm:ml-2 bg-yellow-500 text-xs">{allPendingOrders.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs sm:text-sm">
            <span className="hidden sm:inline">Fulfillment Log</span>
            <span className="sm:hidden">Log</span>
          </TabsTrigger>
        </TabsList>

        {/* Setup Guide Tab */}
        {!setupProgress.allComplete && (
          <TabsContent value="guide" forceMount className="data-[state=inactive]:hidden">
            <SetupGuide
              onEnableAutoDelivery={() => toggleGlobalAutoDelivery.mutate(true)}
              autoDeliveryEnabled={globalAutoDeliveryEnabled}
              isToggling={toggleGlobalAutoDelivery.isPending}
              onOpenCreateDialog={() => setIsCreateDialogOpen(true)}
              onScrollToProducts={() => {
                productsRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
            />
          </TabsContent>
        )}

        {/* Products & Keys Tab */}
        <TabsContent value="products" forceMount className="space-y-4 data-[state=inactive]:hidden" ref={productsRef}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                      Deselect
                    </Button>
                    <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete ({selectedIds.size})
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {selectedIds.size} product{selectedIds.size > 1 ? 's' : ''}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the selected products and all their associated keys. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                            disabled={bulkDeleteMutation.isPending}
                          >
                            {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {itemsLoading ? (
                <div className="py-12 text-center text-muted-foreground">Loading...</div>
              ) : filteredItems.length === 0 ? (
                <div className="py-12 text-center">
                  <Boxes className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">No products yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first inventory item to start managing keys and linking listings.
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Product
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 pl-4">
                        <Checkbox
                          checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedIds(new Set(filteredItems.map(i => i.id)));
                            } else {
                              setSelectedIds(new Set());
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="hidden sm:table-cell">SKU</TableHead>
                      <TableHead>Keys</TableHead>
                      <TableHead className="hidden md:table-cell">Linked</TableHead>
                      <TableHead className="w-16">Active</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map(item => {
                      const isExpanded = expandedItems.has(item.id);
                      const itemKeys = getKeysForItem(item.id);
                      const availableKeys = itemKeys.filter(k => k.status === 'available');
                      const usedKeys = itemKeys.filter(k => k.status === 'used');
                      const linkedListings = getLinkedListings(item.id);

                      return (
                        <>
                          <TableRow
                            key={item.id}
                            className={`cursor-pointer transition-colors ${isExpanded ? 'bg-muted/30' : ''} ${selectedIds.has(item.id) ? 'bg-primary/5' : ''}`}
                            onClick={() => toggleExpanded(item.id)}
                          >
                            <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedIds.has(item.id)}
                                onCheckedChange={(checked) => {
                                  const next = new Set(selectedIds);
                                  if (checked) next.add(item.id);
                                  else next.delete(item.id);
                                  setSelectedIds(next);
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 shrink-0">
                                  <Package className="h-4 w-4 text-primary" />
                                </div>
                                <span className="font-medium truncate max-w-[200px]">{item.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <span className="font-mono text-xs text-muted-foreground">{item.sku || "—"}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Badge variant={availableKeys.length > 0 ? "default" : "secondary"} className="text-xs tabular-nums">
                                  {availableKeys.length}
                                </Badge>
                                <span className="text-muted-foreground text-xs">/</span>
                                <span className="text-xs text-muted-foreground tabular-nums">{usedKeys.length + availableKeys.length}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {linkedListings.length > 0 ? (
                                <Badge variant="outline" className="bg-accent/50 text-xs">
                                  <LinkIcon className="h-3 w-3 mr-1" />
                                  {linkedListings.length}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Switch
                                checked={item.auto_delivery_enabled}
                                onCheckedChange={(checked) =>
                                  updateItemMutation.mutate({ id: item.id, auto_delivery_enabled: checked })
                                }
                              />
                            </TableCell>
                            <TableCell>
                              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            </TableCell>
                          </TableRow>

                          {/* Expanded Detail Panel */}
                          {isExpanded && (
                            <TableRow key={`${item.id}-detail`}>
                              <TableCell colSpan={7} className="p-0">
                                <div className="border-t bg-muted/20 p-4 sm:p-6 space-y-6">
                                  <div className="grid gap-6 md:grid-cols-2">
                                    {/* Left Column - Settings & Keys */}
                                    <div className="space-y-4">
                                      <div className="space-y-2">
                                        <Label>Product Name</Label>
                                        <Input
                                          defaultValue={item.name}
                                          onBlur={(e) => {
                                            const val = e.target.value.trim();
                                            if (val && val !== item.name) updateItemMutation.mutate({ id: item.id, name: val });
                                          }}
                                          placeholder="Product name"
                                        />
                                      </div>

                                      <div className="space-y-2">
                                        <Label>SKU</Label>
                                        <Input
                                          defaultValue={item.sku || ""}
                                          onBlur={(e) => {
                                            const val = e.target.value.trim();
                                            if (val !== (item.sku || "")) updateItemMutation.mutate({ id: item.id, sku: val || null });
                                          }}
                                          placeholder="Optional SKU"
                                        />
                                      </div>

                                      <div className="space-y-2">
                                        <Label>Delivery Message</Label>
                                        <Textarea
                                          defaultValue={item.delivery_message || DEFAULT_MESSAGE}
                                          onBlur={(e) => {
                                            const val = e.target.value;
                                            if (val !== (item.delivery_message || DEFAULT_MESSAGE)) {
                                              updateItemMutation.mutate({ id: item.id, delivery_message: val });
                                            }
                                          }}
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
                                          defaultValue={item.download_url || ""}
                                          onBlur={(e) => {
                                            const val = e.target.value.trim();
                                            if (val !== (item.download_url || "")) {
                                              updateItemMutation.mutate({ id: item.id, download_url: val });
                                            }
                                          }}
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
                                            <TableHead className="hidden md:table-cell">Platform</TableHead>
                                            <TableHead className="hidden md:table-cell">Used At</TableHead>
                                            <TableHead className="w-10"></TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {itemKeys.slice(0, 10).map(key => {
                                            const isRevealed = revealedKeys.has(key.id);
                                            const fullKey = key.digital_key;
                                            const maskedKey = fullKey.length > 12
                                              ? `${fullKey.substring(0, 5)}…${fullKey.substring(fullKey.length - 4)}`
                                              : fullKey;
                                            return (
                                            <TableRow key={key.id}>
                                              <TableCell className="font-mono text-xs sm:text-sm">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <span className="break-all select-all">
                                                        {isRevealed ? fullKey : maskedKey}
                                                      </span>
                                                    </TooltipTrigger>
                                                    {!isRevealed && (
                                                      <TooltipContent className="font-mono max-w-[90vw] break-all">
                                                        {fullKey}
                                                      </TooltipContent>
                                                    )}
                                                  </Tooltip>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 shrink-0"
                                                    onClick={() => {
                                                      setRevealedKeys(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(key.id)) next.delete(key.id);
                                                        else next.add(key.id);
                                                        return next;
                                                      });
                                                    }}
                                                    aria-label={isRevealed ? "Hide key" : "Show key"}
                                                  >
                                                    {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 shrink-0"
                                                    onClick={() => {
                                                      navigator.clipboard.writeText(fullKey);
                                                      toast.success("Key copied");
                                                    }}
                                                    aria-label="Copy key"
                                                  >
                                                    <Copy className="h-3.5 w-3.5" />
                                                  </Button>
                                                </div>
                                              </TableCell>
                                              <TableCell>
                                                <Badge variant={key.status === "available" ? "default" : "secondary"} className="text-xs">
                                                  {key.status === "available" ? "Available" : "Used"}
                                                </Badge>
                                              </TableCell>
                                              <TableCell className="capitalize hidden md:table-cell">
                                                {key.platform || "-"}
                                              </TableCell>
                                              <TableCell className="hidden md:table-cell">
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
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                      {itemKeys.length > 10 && (
                                        <p className="text-sm text-muted-foreground text-center py-2">
                                          Showing 10 of {itemKeys.length} keys
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {/* Actions */}
                                  <div className="flex justify-end gap-2 pt-4 border-t">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => duplicateItemMutation.mutate(item)}
                                          disabled={duplicateItemMutation.isPending}
                                        >
                                          <Copy className="h-4 w-4 mr-2" />
                                          Duplicate
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Duplicate product (without keys or linked listings)</TooltipContent>
                                    </Tooltip>
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
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pending Orders Tab */}
        <TabsContent value="pending" forceMount className="space-y-4 data-[state=inactive]:hidden">
          {allPendingOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="font-semibold mb-2">All caught up!</h3>
                <p className="text-muted-foreground">
                  No pending orders require your attention.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="hidden md:table-cell">Platform</TableHead>
                    <TableHead className="hidden md:table-cell">Buyer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Error</TableHead>
                    <TableHead className="w-20 sm:w-32">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPendingOrders.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs sm:text-sm">
                        {String(log.order_id).substring(0, 8)}{String(log.order_id).length > 8 ? '...' : ''}
                      </TableCell>
                      <TableCell className="max-w-[120px] sm:max-w-[200px] truncate text-sm">
                        {log.item_title || "-"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="capitalize">
                          {log.platform || 'ebay'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{log.buyer_username || "-"}</TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell className="hidden lg:table-cell max-w-[200px] truncate text-destructive text-sm">
                        {log.error_message || log.message_error || (log.platform === 'shopify' ? 'Awaiting fulfillment' : '-')}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => manualFulfillOrder(log.order_id, true, log.platform || 'ebay')}
                          disabled={processingOrderId === log.order_id}
                        >
                          {processingOrderId === log.order_id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-1" />
                              {log.status === 'pending' ? 'Fulfill' : 'Retry'}
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Fulfillment Log Tab */}
        <TabsContent value="logs" forceMount className="space-y-4 data-[state=inactive]:hidden">
          <Card>
            {logsLoading ? (
              <CardContent className="py-12 text-center">Loading...</CardContent>
            ) : !fulfillmentLogs || fulfillmentLogs.length === 0 ? (
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">No fulfillments yet</h3>
                <p className="text-muted-foreground">
                  Fulfilled orders will appear here.
                </p>
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead className="hidden sm:table-cell">Item</TableHead>
                    <TableHead className="hidden md:table-cell">Platform</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Message</TableHead>
                    <TableHead className="hidden lg:table-cell">Invoice</TableHead>
                    <TableHead className="hidden md:table-cell">Fulfilled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fulfillmentLogs
                    .filter(log => !(log.error_message && log.error_message.toLowerCase().includes("not linked to any inventory item")))
                    .slice(0, 50).map(log => (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setSelectedLog(log);
                        setDetailSheetOpen(true);
                      }}
                    >
                      <TableCell className="text-xs sm:text-sm">
                        {format(new Date(log.created_at), "MMM dd, HH:mm")}
                      </TableCell>
                      <TableCell className="font-mono text-xs sm:text-sm">
                        {log.order_id.substring(0, 8)}...
                      </TableCell>
                      <TableCell className="hidden sm:table-cell max-w-[150px] truncate">
                        {log.item_title || "-"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell capitalize">
                        {log.platform || 'ebay'}
                      </TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {log.message_sent ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600">
                            <MessageCircle className="w-3 h-3 mr-1" />
                            Sent
                          </Badge>
                        ) : log.message_error ? (
                          <Badge variant="destructive" className="text-xs">
                            <XCircle className="w-3 h-3 mr-1" />
                            Failed
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {log.invoice_sent ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600">
                            <FileText className="w-3 h-3 mr-1" />
                            Sent
                          </Badge>
                        ) : log.invoice_error ? (
                          <Badge variant="destructive" className="text-xs">
                            <XCircle className="w-3 h-3 mr-1" />
                            Failed
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {log.marked_fulfilled ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <FulfillmentDetailSheet
        log={selectedLog}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
      />
    </div>
  );
}
