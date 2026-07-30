-- Create buyer_addresses table to store eBay buyer addresses
CREATE TABLE public.buyer_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_id TEXT NOT NULL,
  buyer_username TEXT,
  buyer_email TEXT,
  full_name TEXT,
  street_address TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country_code TEXT,
  country_name TEXT,
  phone TEXT,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, order_id)
);

-- Create invoices table to store generated invoices
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  order_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Seller info
  seller_name TEXT,
  seller_address TEXT,
  seller_vat_number TEXT,
  seller_email TEXT,
  
  -- Buyer info
  buyer_name TEXT,
  buyer_address TEXT,
  buyer_email TEXT,
  buyer_vat_number TEXT,
  
  -- Line items (JSON array)
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Totals
  subtotal NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  
  -- Status
  status TEXT DEFAULT 'draft',
  sent_at TIMESTAMP WITH TIME ZONE,
  sent_to_email TEXT,
  
  -- PDF storage
  pdf_url TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add seller invoice settings to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS seller_business_name TEXT,
ADD COLUMN IF NOT EXISTS seller_address TEXT,
ADD COLUMN IF NOT EXISTS seller_vat_number TEXT,
ADD COLUMN IF NOT EXISTS seller_email TEXT,
ADD COLUMN IF NOT EXISTS invoice_prefix TEXT DEFAULT 'INV',
ADD COLUMN IF NOT EXISTS next_invoice_number INTEGER DEFAULT 1;

-- Enable RLS
ALTER TABLE public.buyer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS policies for buyer_addresses
CREATE POLICY "Users can view their own buyer addresses" 
ON public.buyer_addresses FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own buyer addresses" 
ON public.buyer_addresses FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own buyer addresses" 
ON public.buyer_addresses FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own buyer addresses" 
ON public.buyer_addresses FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for invoices
CREATE POLICY "Users can view their own invoices" 
ON public.invoices FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own invoices" 
ON public.invoices FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoices" 
ON public.invoices FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoices" 
ON public.invoices FOR DELETE 
USING (auth.uid() = user_id);

-- Create updated_at triggers
CREATE TRIGGER update_buyer_addresses_updated_at
  BEFORE UPDATE ON public.buyer_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();