-- Create table for Shopify credentials (similar to eBay)
CREATE TABLE public.user_shopify_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  shop_domain TEXT NOT NULL,
  access_token TEXT,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_shopify_credentials ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access"
ON public.user_shopify_credentials
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Users can view their own credentials
CREATE POLICY "Users can view their own shopify credentials"
ON public.user_shopify_credentials
FOR SELECT
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_shopify_credentials_updated_at
BEFORE UPDATE ON public.user_shopify_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();