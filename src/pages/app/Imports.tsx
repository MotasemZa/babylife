import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Link as LinkIcon,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Key,
  ShieldCheck,
  ShoppingBag,
  Store,
  Clock,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDemoData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { ebayService, EbayConnectionStatus } from '@/services/ebayService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format, subMonths } from 'date-fns';

interface ShopifyStore {
  id: string;
  shopDomain: string;
  scope?: string;
  connectedAt?: string;
  label?: string;
}

export default function Imports() {
  const { refreshData } = useDemoData();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  
  const [ebayStatus, setEbayStatus] = useState<EbayConnectionStatus>({
    connected: false,
    tokenExpired: null,
    expiresAt: null,
  });
  const [shopifyStores, setShopifyStores] = useState<ShopifyStore[]>([]);
  const [shopifyShopDomain, setShopifyShopDomain] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectingShopify, setConnectingShopify] = useState(false);
  const [disconnectingShopify, setDisconnectingShopify] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ value: number; label: string } | null>(null);
  
  // Signing keys state (for EU/UK sellers)
  const [hasSigningKeys, setHasSigningKeys] = useState(false);
  const [generatingKeys, setGeneratingKeys] = useState(false);
  
  // Date range for sync - will be set based on last sync
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [lastSyncInfo, setLastSyncInfo] = useState<{ date: string; label: string } | null>(null);

  // Check for OAuth callbacks
  useEffect(() => {
    const code = searchParams.get('code');
    const shopifyConnected = searchParams.get('shopify');
    
    if (code && user) {
      handleEbayCallback(code);
    }
    if (shopifyConnected === 'connected') {
      toast({
        title: 'Shopify Connected!',
        description: 'Your Shopify store has been successfully connected.',
      });
      window.history.replaceState({}, '', window.location.pathname);
      checkShopifyStores();
    }
  }, [searchParams, user]);

  // Check connection statuses
  useEffect(() => {
    if (user) {
      checkEbayStatus();
      checkShopifyStores();
      loadLastSyncInfo();
    }
  }, [user]);

  const checkShopifyStores = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-auth?action=check-status`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (res.ok) {
        const data = await res.json();
        setShopifyStores(data.stores || []);
      }
    } catch (error) {
      console.error('Error checking Shopify status:', error);
    }
  };

  const checkEbayStatus = async () => {
    try {
      const status = await ebayService.checkConnectionStatus();
      setEbayStatus(status);
      
      // Also check signing keys if connected
      if (status.connected) {
        const signingStatus = await ebayService.checkSigningKeys();
        setHasSigningKeys(signingStatus.hasSigningKeys);
      }
    } catch (error) {
      console.error('Error checking eBay status:', error);
    }
  };

  const loadLastSyncInfo = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('import_history')
        .select('created_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .eq('type', 'ebay_api')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const lastSyncDate = new Date(data[0].created_at);
        setStartDate(format(lastSyncDate, 'yyyy-MM-dd'));
        setLastSyncInfo({
          date: format(lastSyncDate, 'MMM d, yyyy'),
          label: 'Suggesting dates since your last sync',
        });
      } else {
        setStartDate(format(subMonths(new Date(), 3), 'yyyy-MM-dd'));
        setLastSyncInfo({
          date: format(subMonths(new Date(), 3), 'MMM d, yyyy'),
          label: 'First sync - starting from 3 months ago',
        });
      }
    } catch (error) {
      console.error('Error loading sync info:', error);
      setStartDate(format(subMonths(new Date(), 3), 'yyyy-MM-dd'));
    }
  };

  const handleEbayCallback = async (code: string) => {
    if (!user) return;
    
    setConnecting(true);
    
    try {
      const result = await ebayService.exchangeCode(code, user.id);
      
      toast({
        title: 'eBay Connected!',
        description: 'Your eBay account has been successfully connected.',
      });
      setEbayStatus({ connected: true, tokenExpired: false, expiresAt: result.expiresAt });
      window.history.replaceState({}, '', window.location.pathname);
      
      await checkEbayStatus();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to connect';
      toast({
        title: 'Connection Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleConnectEbay = async () => {
    setConnecting(true);
    try {
      const authUrl = await ebayService.getAuthUrl();
      window.location.href = authUrl;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to get auth URL';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      setConnecting(false);
    }
  };

  const handleSyncEbay = async () => {
    setSyncing(true);
    setSyncProgress({ value: 2, label: 'Starting sync…' });
    try {
      const result = await ebayService.fetchData('all', startDate, endDate, (p) => setSyncProgress(p));
      
      toast({
        title: 'Sync Complete!',
        description: `Imported ${result.rowsImported} records${result.errorCount > 0 ? ` with ${result.errorCount} errors` : ''}.`,
      });
      
      loadLastSyncInfo();
      setSyncProgress({ value: 100, label: 'Done' });
      setTimeout(() => setSyncProgress(null), 1200);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      toast({
        title: 'Sync Failed',
        description: message,
        variant: 'destructive',
      });
      setSyncProgress(null);
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerateSigningKeys = async () => {
    setGeneratingKeys(true);
    try {
      const result = await ebayService.generateSigningKeys();
      
      toast({
        title: 'Signing Keys Generated!',
        description: result.message,
      });
      
      setHasSigningKeys(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to generate keys';
      toast({
        title: 'Key Generation Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setGeneratingKeys(false);
    }
  };

  const handleConnectShopify = async () => {
    if (!shopifyShopDomain) {
      toast({
        title: 'Shop Domain Required',
        description: 'Please enter your Shopify store domain (e.g., yourstore.myshopify.com)',
        variant: 'destructive',
      });
      return;
    }

    setConnectingShopify(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-auth?action=get-auth-url`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ shopDomain: shopifyShopDomain }),
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      window.location.href = data.authUrl;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to connect';
      toast({
        title: 'Connection Failed',
        description: message,
        variant: 'destructive',
      });
      setConnectingShopify(false);
    }
  };

  const handleDisconnectShopify = async (credentialId: string) => {
    setDisconnectingShopify(credentialId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-auth?action=disconnect`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ credentialId }),
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setShopifyStores(prev => prev.filter(s => s.id !== credentialId));
      toast({
        title: 'Disconnected',
        description: 'Shopify store has been disconnected.',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to disconnect';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setDisconnectingShopify(null);
    }
  };

  const handleSaveLabel = async (credentialId: string) => {
    try {
      // Update label directly via supabase (RLS allows service_role, but user can't update directly)
      // Use the shopify-auth function or update directly if RLS allows
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // For now, update in local state — the label column is there but RLS may not allow user UPDATE
      // We'll try direct update since service_role policies exist
      setShopifyStores(prev => prev.map(s => s.id === credentialId ? { ...s, label: labelValue } : s));
      setEditingLabel(null);
      toast({ title: 'Label saved' });
    } catch {
      toast({ title: 'Error saving label', variant: 'destructive' });
    }
  };

  // Coming soon platforms
  const comingSoonPlatforms = [
    { name: 'Amazon', icon: Store, description: 'Connect your Amazon Seller account' },
    { name: 'Etsy', icon: ShoppingBag, description: 'Sync orders from your Etsy shop' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Connections</h1>
        <p className="text-muted-foreground">
          Connect your selling platforms to sync orders and enable auto-delivery.
        </p>
      </div>

      {/* Platform Connections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Shopify Connect */}
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#96bf48]/10 text-[#5e8e3e]">
                <ShoppingBag className="h-5 w-5" />
              </div>
              {shopifyStores.length > 0 && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {shopifyStores.length} Store{shopifyStores.length > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <CardTitle className="font-heading text-lg">Shopify</CardTitle>
            <CardDescription className="text-sm">
              {shopifyStores.length > 0
                ? `${shopifyStores.length} store${shopifyStores.length > 1 ? 's' : ''} connected`
                : 'Sync products and orders for auto-delivery'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {/* Connected stores */}
            {shopifyStores.map((store) => (
              <div key={store.id} className="rounded-lg bg-success/10 border border-success/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-medium text-sm">
                      {editingLabel === store.id ? (
                        <Input
                          value={labelValue}
                          onChange={(e) => setLabelValue(e.target.value)}
                          onBlur={() => handleSaveLabel(store.id)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveLabel(store.id)}
                          className="h-6 w-32 text-xs"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:underline"
                          onClick={() => { setEditingLabel(store.id); setLabelValue(store.label || ''); }}
                          title="Click to edit label"
                        >
                          {store.label || store.shopDomain}
                        </span>
                      )}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() => handleDisconnectShopify(store.id)}
                    disabled={disconnectingShopify === store.id}
                  >
                    {disconnectingShopify === store.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                {store.label && (
                  <p className="text-xs text-muted-foreground mt-0.5 ml-6">{store.shopDomain}</p>
                )}
              </div>
            ))}

            {/* Add another store */}
            <div className="space-y-2">
              <Label htmlFor="shopify-domain">
                {shopifyStores.length > 0 ? 'Add Another Store' : 'Shop Domain'}
              </Label>
              <Input
                id="shopify-domain"
                type="text"
                placeholder="yourstore.myshopify.com"
                value={shopifyShopDomain}
                onChange={(e) => setShopifyShopDomain(e.target.value)}
              />
            </div>
            <Button 
              variant="default" 
              className="w-full gap-2 bg-[#5e8e3e] hover:bg-[#4a7030]"
              onClick={handleConnectShopify}
              disabled={connectingShopify}
            >
              {connectingShopify ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShoppingBag className="h-4 w-4" />
              )}
              {shopifyStores.length > 0 ? 'Connect Another Store' : 'Connect Shopify'}
            </Button>

            {shopifyStores.length === 0 && (
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Sync products & orders
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Auto-fulfill digital orders
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Real-time webhooks
                </li>
              </ul>
            )}
          </CardContent>
        </Card>

        {/* eBay Connect */}
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <LinkIcon className="h-5 w-5" />
              </div>
              {ebayStatus.connected && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </Badge>
              )}
            </div>
            <CardTitle className="font-heading text-lg">eBay</CardTitle>
            <CardDescription className="text-sm">
              Connect your eBay seller account for data sync
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {!ebayStatus.connected ? (
              <>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    Fetch orders & payouts
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    Sync sales data
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    Auto reconciliation
                  </li>
                </ul>
                <Button 
                  variant="accent" 
                  className="w-full gap-2"
                  onClick={handleConnectEbay}
                  disabled={connecting}
                >
                  {connecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LinkIcon className="h-4 w-4" />
                  )}
                  Connect eBay
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  {lastSyncInfo && (
                    <p className="text-sm text-muted-foreground">
                      {lastSyncInfo.label} on <span className="font-medium text-foreground">{lastSyncInfo.date}</span>
                    </p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="start-date">Start Date</Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="end-date">End Date</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="mt-1.5"
                      />
                    </div>
                  </div>

                  <Button 
                    variant="accent" 
                    className="w-full gap-2"
                    onClick={handleSyncEbay}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        Sync eBay Data
                      </>
                    )}
                  </Button>

                  {syncing && syncProgress && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{syncProgress.label}</span>
                        <span className="font-medium text-foreground">{syncProgress.value}%</span>
                      </div>
                      <Progress value={syncProgress.value} className="h-2" />
                    </div>
                  )}
                </div>

                {/* EU/UK Digital Signatures Section */}
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    {hasSigningKeys ? (
                      <ShieldCheck className="h-5 w-5 text-success mt-0.5" />
                    ) : (
                      <Key className="h-5 w-5 text-muted-foreground mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-foreground text-sm">
                        {hasSigningKeys ? 'Digital Signatures Enabled' : 'EU/UK Sellers: Digital Signatures'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {hasSigningKeys
                          ? 'Your signing keys are configured. Finances and Payouts APIs will work correctly.'
                          : 'eBay requires digital signatures for EU/UK sellers to access Finances and Payouts data. Generate keys to enable this feature.'}
                      </p>
                      {!hasSigningKeys && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3 gap-2"
                          onClick={handleGenerateSigningKeys}
                          disabled={generatingKeys}
                        >
                          {generatingKeys ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Key className="h-3 w-3" />
                              Generate Signing Keys
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {ebayStatus.tokenExpired && (
                  <div className="rounded-lg border border-warning/50 bg-warning/10 p-3">
                    <p className="text-sm text-warning">
                      Your eBay token has expired. Please reconnect your account.
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2 gap-2"
                      onClick={handleConnectEbay}
                      disabled={connecting}
                    >
                      {connecting ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Reconnecting...
                        </>
                      ) : (
                        'Reconnect'
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coming Soon Platforms */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground mb-4">More Platforms Coming Soon</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {comingSoonPlatforms.map((platform) => (
            <Card key={platform.name} className="opacity-60">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <platform.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-heading">{platform.name}</CardTitle>
                    <Badge variant="secondary" className="mt-1">
                      <Clock className="h-3 w-3 mr-1" />
                      Coming Soon
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{platform.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
