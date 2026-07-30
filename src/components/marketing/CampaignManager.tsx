import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, ExternalLink, Copy, BarChart3, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  budget: number;
  spent: number;
  clicks: number;
  conversions: number;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  ad_copy: any;
  created_at: string;
  fb_campaign_id?: string | null;
  fb_status?: string | null;
  daily_budget?: number | null;
}

const platformLabels: Record<string, string> = {
  google_ads: 'Google Ads',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

const statusColors: Record<string, string> = {
  draft: 'secondary',
  active: 'default',
  paused: 'outline',
  completed: 'destructive',
};

export const CampaignManager = () => {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('google_ads');
  const [budget, setBudget] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');

  const { data: campaigns = [], refetch } = useQuery({
    queryKey: ['marketing-campaigns', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Campaign[];
    },
    enabled: !!user,
  });

  const totalSpent = campaigns.reduce((s, c) => s + (c.spent || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks || 0), 0);
  const totalConversions = campaigns.reduce((s, c) => s + (c.conversions || 0), 0);
  const roi = totalSpent > 0 ? ((totalConversions / totalSpent) * 100).toFixed(1) : '0';

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    try {
      const { error } = await supabase.from('marketing_campaigns').insert({
        user_id: user.id,
        name,
        platform,
        budget: parseFloat(budget) || 0,
        utm_source: utmSource || null,
        utm_medium: utmMedium || null,
        utm_campaign: utmCampaign || null,
      });
      if (error) throw error;
      setShowCreate(false);
      setName(''); setBudget(''); setUtmSource(''); setUtmMedium(''); setUtmCampaign('');
      refetch();
      toast.success('Campaign created');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleUpdateMetrics = async (id: string, field: string, value: string) => {
    try {
      const { error } = await supabase
        .from('marketing_campaigns')
        .update({ [field]: parseFloat(value) || 0 })
        .eq('id', id);
      if (error) throw error;
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('marketing_campaigns').update({ status }).eq('id', id);
      if (error) throw error;
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id);
      if (error) throw error;
      refetch();
      toast.success('Campaign deleted');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const [syncing, setSyncing] = useState<string | null>(null);

  const handleSyncMetrics = async (campaign: Campaign) => {
    if (!campaign.fb_campaign_id) {
      toast.error('This campaign is not linked to Facebook');
      return;
    }
    setSyncing(campaign.id);
    try {
      const { data, error } = await supabase.functions.invoke('facebook-ad-status', {
        body: { campaign_id: campaign.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      refetch();
      toast.success(`Synced: ${data.metrics.clicks} clicks, $${data.metrics.spent} spent`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to sync metrics');
    } finally {
      setSyncing(null);
    }
  };

  const buildUtmUrl = () => {
    if (!baseUrl) return '';
    const params = new URLSearchParams();
    if (utmSource) params.set('utm_source', utmSource);
    if (utmMedium) params.set('utm_medium', utmMedium);
    if (utmCampaign) params.set('utm_campaign', utmCampaign);
    const qs = params.toString();
    return qs ? `${baseUrl}?${qs}` : baseUrl;
  };

  const copyUtmUrl = () => {
    const url = buildUtmUrl();
    if (url) {
      navigator.clipboard.writeText(url);
      toast.success('UTM URL copied');
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Campaigns', value: campaigns.length },
          { label: 'Total Spent', value: `$${totalSpent.toFixed(2)}` },
          { label: 'Total Clicks', value: totalClicks },
          { label: 'Conversions', value: totalConversions },
        ].map(card => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Campaign Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Campaigns
            </CardTitle>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4" /> New Campaign</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Campaign Name *</label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="Summer Sale 2026" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Platform</label>
                      <Select value={platform} onValueChange={setPlatform}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(platformLabels).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Budget</label>
                      <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="500" />
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold mb-3">UTM Builder</h4>
                    <div className="space-y-2">
                      <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://yourstore.com/product" />
                      <div className="grid grid-cols-3 gap-2">
                        <Input value={utmSource} onChange={e => setUtmSource(e.target.value)} placeholder="Source" />
                        <Input value={utmMedium} onChange={e => setUtmMedium(e.target.value)} placeholder="Medium" />
                        <Input value={utmCampaign} onChange={e => setUtmCampaign(e.target.value)} placeholder="Campaign" />
                      </div>
                      {buildUtmUrl() && (
                        <div className="flex items-center gap-2 p-2 rounded bg-muted/50 text-xs">
                          <span className="flex-1 truncate">{buildUtmUrl()}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyUtmUrl}><Copy className="h-3 w-3" /></Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button onClick={handleCreate} className="w-full">Create Campaign</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No campaigns yet. Create one to start tracking.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                   <TableRow>
                     <TableHead>Name</TableHead>
                     <TableHead>Platform</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead className="text-right">Budget</TableHead>
                     <TableHead className="text-right">Spent</TableHead>
                     <TableHead className="text-right">Clicks</TableHead>
                     <TableHead className="text-right">Conv.</TableHead>
                     <TableHead></TableHead>
                     <TableHead></TableHead>
                   </TableRow>
                 </TableHeader>
                <TableBody>
                  {campaigns.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline">{platformLabels[c.platform] || c.platform}</Badge>
                          {c.fb_campaign_id && (
                            <Badge variant="secondary" className="text-[10px]">
                              FB: {c.fb_status || 'linked'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select value={c.status} onValueChange={v => handleStatusChange(c.id, v)}>
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="paused">Paused</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">${(c.budget || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          className="h-7 w-20 text-xs text-right"
                          defaultValue={c.spent || 0}
                          onBlur={e => handleUpdateMetrics(c.id, 'spent', e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          className="h-7 w-16 text-xs text-right"
                          defaultValue={c.clicks || 0}
                          onBlur={e => handleUpdateMetrics(c.id, 'clicks', e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          className="h-7 w-16 text-xs text-right"
                          defaultValue={c.conversions || 0}
                          onBlur={e => handleUpdateMetrics(c.id, 'conversions', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        {c.fb_campaign_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleSyncMetrics(c)}
                            disabled={syncing === c.id}
                          >
                            {syncing === c.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
