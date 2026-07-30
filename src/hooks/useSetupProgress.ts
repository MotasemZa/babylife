import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ebayService } from "@/services/ebayService";

export interface SetupProgressData {
  platformConnected: boolean;
  listingsSynced: boolean;
  inventoryCreated: boolean;
  keysAdded: boolean;
  listingsLinked: boolean;
  smtpConfigured: boolean;
  autoDeliveryEnabled: boolean;
  telegramConfigured: boolean;
  completedCount: number;
  totalSteps: number;
  progress: number;
  allComplete: boolean;
  canEnableAutoDelivery: boolean;
  nextIncompleteStep: string | null;
  isLoading: boolean;
}

export function useSetupProgress(): SetupProgressData {
  const { user } = useAuth();

  // Check platform connections
  const { data: ebayConnected, isLoading: ebayLoading } = useQuery({
    queryKey: ["ebay-connection-setup"],
    queryFn: async () => {
      try {
        const status = await ebayService.checkConnectionStatus();
        return status.connected;
      } catch {
        return false;
      }
    },
    enabled: !!user,
    staleTime: 60000,
  });

  const { data: shopifyCredentials, isLoading: shopifyLoading } = useQuery({
    queryKey: ["shopify-credentials-setup"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_shopify_credentials")
        .select("access_token")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Check platform listings count
  const { data: platformListingsCount, isLoading: listingsLoading } = useQuery({
    queryKey: ["platform-listings-count-setup"],
    queryFn: async () => {
      const { count } = await supabase
        .from("platform_listings")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id);
      return count || 0;
    },
    enabled: !!user,
  });

  // Check inventory items count
  const { data: inventoryItemsCount, isLoading: inventoryLoading } = useQuery({
    queryKey: ["inventory-items-count-setup"],
    queryFn: async () => {
      const { count } = await supabase
        .from("inventory_items")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id);
      return count || 0;
    },
    enabled: !!user,
  });

  // Check available keys count
  const { data: availableKeysCount, isLoading: keysLoading } = useQuery({
    queryKey: ["available-keys-count-setup"],
    queryFn: async () => {
      const { count } = await supabase
        .from("digital_keys")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("status", "available");
      return count || 0;
    },
    enabled: !!user,
  });

  // Check linked listings count
  const { data: linkedListingsCount, isLoading: linkedLoading } = useQuery({
    queryKey: ["linked-listings-count-setup"],
    queryFn: async () => {
      const { count } = await supabase
        .from("platform_listings")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .not("inventory_item_id", "is", null);
      return count || 0;
    },
    enabled: !!user,
  });

  // Check SMTP configured
  const { data: smtpSettings, isLoading: smtpLoading } = useQuery({
    queryKey: ["smtp-settings-setup"],
    queryFn: async () => {
      const { data } = await supabase
        .from("smtp_settings")
        .select("verified_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Check auto-delivery enabled
  const { data: userSettings, isLoading: settingsLoading } = useQuery({
    // NOTE: keep this key distinct from AutoDelivery's full settings query
    // to avoid overwriting cached fields like `auto_send_invoice`.
    queryKey: ["user-settings-auto-delivery-enabled"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("auto_delivery_enabled")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Check Telegram configured (optional)
  const { data: notificationSettings, isLoading: notificationsLoading } = useQuery({
    queryKey: ["notification-settings-setup"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_settings")
        .select("telegram_chat_id, telegram_enabled")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const platformConnected = ebayConnected || !!shopifyCredentials?.access_token;
  const listingsSynced = (platformListingsCount || 0) > 0;
  const inventoryCreated = (inventoryItemsCount || 0) > 0;
  const keysAdded = (availableKeysCount || 0) > 0;
  const listingsLinked = (linkedListingsCount || 0) > 0;
  const smtpConfigured = !!smtpSettings?.verified_at;
  const autoDeliveryEnabled = userSettings?.auto_delivery_enabled ?? false;
  const telegramConfigured = !!(notificationSettings?.telegram_chat_id && notificationSettings?.telegram_enabled);

  const steps = [
    { id: "connect", complete: platformConnected },
    { id: "sync", complete: listingsSynced },
    { id: "inventory", complete: inventoryCreated },
    { id: "keys", complete: keysAdded },
    { id: "link", complete: listingsLinked },
    { id: "smtp", complete: smtpConfigured },
    { id: "enable", complete: autoDeliveryEnabled },
  ];

  const completedCount = steps.filter((s) => s.complete).length;
  const totalSteps = steps.length;
  const progress = (completedCount / totalSteps) * 100;
  const allComplete = completedCount === totalSteps;

  // Can enable auto-delivery only if all prerequisites (except "enable" itself) are complete
  const canEnableAutoDelivery = 
    platformConnected && 
    inventoryCreated && 
    keysAdded && 
    listingsLinked && 
    smtpConfigured;

  const stepLabels: Record<string, string> = {
    connect: "Connect a platform",
    sync: "Sync your listings",
    inventory: "Create an inventory item",
    keys: "Add digital keys",
    link: "Link listings to products",
    smtp: "Configure SMTP email",
    enable: "Enable Auto-Delivery",
  };

  const nextIncomplete = steps.find((s) => !s.complete);
  const nextIncompleteStep = nextIncomplete ? stepLabels[nextIncomplete.id] : null;

  const isLoading =
    ebayLoading ||
    shopifyLoading ||
    listingsLoading ||
    inventoryLoading ||
    keysLoading ||
    linkedLoading ||
    smtpLoading ||
    settingsLoading ||
    notificationsLoading;

  return {
    platformConnected,
    listingsSynced,
    inventoryCreated,
    keysAdded,
    listingsLinked,
    smtpConfigured,
    autoDeliveryEnabled,
    telegramConfigured,
    completedCount,
    totalSteps,
    progress,
    allComplete,
    canEnableAutoDelivery,
    nextIncompleteStep,
    isLoading,
  };
}
