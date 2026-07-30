import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Facebook } from 'lucide-react';
import { toast } from 'sonner';

interface AdCopy {
  headlines?: string[];
  descriptions?: string[];
  primary_text?: string;
  headline?: string;
  description?: string;
  cta?: string;
  raw?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adCopy: AdCopy;
  platform: string;
  title: string;
}

export const FacebookPublishDialog = ({ open, onOpenChange, adCopy, platform, title }: Props) => {
  const { user } = useAuth();
  const [publishing, setPublishing] = useState(false);
  const [campaignName, setCampaignName] = useState(`${title} - ${platform} campaign`);
  const [dailyBudget, setDailyBudget] = useState('5');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [objective, setObjective] = useState('LINK_CLICKS');
  const [linkUrl, setLinkUrl] = useState('');
  const [countries, setCountries] = useState('US');
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('65');

  const handlePublish = async () => {
    if (!user) return;
    setPublishing(true);
    try {
      // First save as campaign locally
      const { data: campaign, error: insertError } = await supabase
        .from('marketing_campaigns')
        .insert({
          user_id: user.id,
          name: campaignName,
          platform,
          ad_copy: adCopy as any,
          status: 'active',
          budget: parseFloat(dailyBudget) || 5,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Publish to Facebook
      const { data, error } = await supabase.functions.invoke('facebook-publish-ad', {
        body: {
          action: 'publish',
          campaign_id: campaign.id,
          campaign_name: campaignName,
          ad_copy: adCopy,
          daily_budget: parseFloat(dailyBudget) || 5,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          objective,
          link_url: linkUrl || undefined,
          targeting: {
            geo_locations: {
              countries: countries.split(',').map(c => c.trim().toUpperCase()),
            },
            age_min: parseInt(ageMin) || 18,
            age_max: parseInt(ageMax) || 65,
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Ad published to Facebook! It\'s set to PAUSED — activate it in the Campaigns tab.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to publish ad');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Facebook className="h-5 w-5 text-[#1877F2]" />
            Publish to Facebook Ads
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Campaign Name</Label>
            <Input value={campaignName} onChange={e => setCampaignName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Daily Budget ($)</Label>
              <Input type="number" value={dailyBudget} onChange={e => setDailyBudget(e.target.value)} min="1" />
            </div>
            <div className="space-y-2">
              <Label>Objective</Label>
              <Select value={objective} onValueChange={setObjective}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LINK_CLICKS">Traffic</SelectItem>
                  <SelectItem value="CONVERSIONS">Sales</SelectItem>
                  <SelectItem value="REACH">Awareness</SelectItem>
                  <SelectItem value="POST_ENGAGEMENT">Engagement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Destination URL</Label>
            <Input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://yourstore.com/product" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="border-t pt-3">
            <h4 className="text-sm font-semibold mb-3">Targeting</h4>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Countries (comma-separated)</Label>
                <Input value={countries} onChange={e => setCountries(e.target.value)} placeholder="US, GB, DE" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Min Age</Label>
                  <Input type="number" value={ageMin} onChange={e => setAgeMin(e.target.value)} min="13" max="65" />
                </div>
                <div className="space-y-2">
                  <Label>Max Age</Label>
                  <Input type="number" value={ageMax} onChange={e => setAgeMax(e.target.value)} min="13" max="65" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            Your ad will be created in <strong>PAUSED</strong> state. Review it in the Campaigns tab and activate when ready.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePublish} disabled={publishing} className="bg-[#1877F2] hover:bg-[#1877F2]/90">
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
            Publish Ad
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
