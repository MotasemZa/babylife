import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Facebook, CheckCircle2, LogOut, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export const FacebookConnectCard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState<any>(null);

  const checkStatus = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.functions.invoke('facebook-auth', {
        body: { action: 'status' },
      });
      if (!error && data) {
        setConnected(data.connected);
        setAccount(data.account);
      }
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, [user]);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (code && state === 'fb_ads_connect') {
      // Remove params from URL
      window.history.replaceState({}, '', window.location.pathname);
      handleCodeExchange(code);
    }
  }, []);

  const handleCodeExchange = async (code: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('facebook-auth', {
        body: {
          action: 'exchange_code',
          code,
          redirect_uri: `${window.location.origin}/app/marketing`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setConnected(true);
      setAccount({
        ad_account_id: data.ad_account?.id,
        account_name: data.ad_account?.name,
        page_name: data.page?.name,
      });
      toast.success('Facebook Ads connected successfully!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to connect Facebook');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('facebook-auth', {
        body: {
          action: 'get_login_url',
          redirect_uri: `${window.location.origin}/app/marketing`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Append state param for callback identification
      const url = new URL(data.loginUrl);
      url.searchParams.set('state', 'fb_ads_connect');
      window.location.href = url.toString();
    } catch (e: any) {
      toast.error(e.message || 'Failed to initiate Facebook login');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('facebook-auth', {
        body: { action: 'disconnect' },
      });
      if (error) throw error;
      setConnected(false);
      setAccount(null);
      toast.success('Facebook Ads disconnected');
    } catch (e: any) {
      toast.error(e.message || 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Checking Facebook connection...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#1877F2]/10 flex items-center justify-center">
              <Facebook className="h-5 w-5 text-[#1877F2]" />
            </div>
            <div>
              <h3 className="font-medium text-sm">Facebook Ads</h3>
              {connected ? (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span className="text-xs text-muted-foreground">
                    {account?.account_name || account?.ad_account_id || 'Connected'}
                    {account?.page_name && ` · ${account.page_name}`}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Connect to publish ads directly</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={loading}>
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={handleConnect} disabled={loading} className="bg-[#1877F2] hover:bg-[#1877F2]/90">
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Facebook className="h-3 w-3" />}
                Connect
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
