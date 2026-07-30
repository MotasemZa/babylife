import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Megaphone, Sparkles, Palette, BarChart3 } from 'lucide-react';
import { AdCopyGenerator } from '@/components/marketing/AdCopyGenerator';
import { ContentCreator } from '@/components/marketing/ContentCreator';
import { CampaignManager } from '@/components/marketing/CampaignManager';
import { FacebookConnectCard } from '@/components/marketing/FacebookConnectCard';

export default function Marketing() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-accent" />
          Marketing
        </h1>
        <p className="text-muted-foreground mt-1">
          Generate ad copy, create content, publish ads, and track campaigns
        </p>
      </div>

      <FacebookConnectCard />

      <Tabs defaultValue="ad-copy" className="w-full">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="ad-copy" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            AI Ad Copy
          </TabsTrigger>
          <TabsTrigger value="creator" className="gap-1.5">
            <Palette className="h-4 w-4" />
            Creator
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Campaigns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ad-copy">
          <AdCopyGenerator />
        </TabsContent>

        <TabsContent value="creator">
          <ContentCreator />
        </TabsContent>

        <TabsContent value="campaigns">
          <CampaignManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
