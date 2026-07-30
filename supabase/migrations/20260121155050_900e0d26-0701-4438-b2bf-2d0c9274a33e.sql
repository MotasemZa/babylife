-- Create inventory_items table (platform-agnostic products)
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  delivery_message TEXT DEFAULT 'Thank you for your purchase! Here is your product:\n\nKey: {KEY}\nDownload: {DOWNLOAD_URL}',
  download_url TEXT,
  auto_delivery_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on inventory_items
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for inventory_items
CREATE POLICY "Users can view their own inventory items"
ON public.inventory_items FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own inventory items"
ON public.inventory_items FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own inventory items"
ON public.inventory_items FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own inventory items"
ON public.inventory_items FOR DELETE
USING (auth.uid() = user_id);

-- Create platform_listings table (links platform-specific listings to inventory)
CREATE TABLE public.platform_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  platform_listing_id TEXT NOT NULL,
  title TEXT,
  image_url TEXT,
  price NUMERIC,
  currency TEXT DEFAULT 'EUR',
  status TEXT DEFAULT 'active',
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform, platform_listing_id)
);

-- Enable RLS on platform_listings
ALTER TABLE public.platform_listings ENABLE ROW LEVEL SECURITY;

-- RLS policies for platform_listings
CREATE POLICY "Users can view their own platform listings"
ON public.platform_listings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own platform listings"
ON public.platform_listings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own platform listings"
ON public.platform_listings FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own platform listings"
ON public.platform_listings FOR DELETE
USING (auth.uid() = user_id);

-- Modify digital_keys table - add inventory_item_id and platform columns
ALTER TABLE public.digital_keys
  ADD COLUMN inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN platform TEXT;

-- Modify fulfillment_log table - add platform and inventory_item_id columns
ALTER TABLE public.fulfillment_log
  ADD COLUMN platform TEXT DEFAULT 'ebay',
  ADD COLUMN inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL;

-- Create updated_at trigger for inventory_items
CREATE TRIGGER update_inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create updated_at trigger for platform_listings
CREATE TRIGGER update_platform_listings_updated_at
BEFORE UPDATE ON public.platform_listings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();