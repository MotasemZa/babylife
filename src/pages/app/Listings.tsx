import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Link2 } from 'lucide-react';
import ListingsTab from '@/components/listings/ListingsTab';
import CrosslistedTab from '@/components/listings/CrosslistedTab';

const Listings = () => {
  const [activeTab, setActiveTab] = useState('listings');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Listings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your listings across platforms
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="listings" className="gap-2">
            <Package className="h-4 w-4" />
            My Listings
          </TabsTrigger>
          <TabsTrigger value="crosslisted" className="gap-2">
            <Link2 className="h-4 w-4" />
            Crosslisted
          </TabsTrigger>
        </TabsList>

        <TabsContent value="listings" forceMount className="data-[state=inactive]:hidden">
          <ListingsTab />
        </TabsContent>

        <TabsContent value="crosslisted" forceMount className="data-[state=inactive]:hidden">
          <CrosslistedTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Listings;
