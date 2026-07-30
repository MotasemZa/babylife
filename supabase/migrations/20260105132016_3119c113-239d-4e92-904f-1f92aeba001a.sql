-- Create digital keys table for key pool management
CREATE TABLE public.digital_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  listing_id TEXT NOT NULL,
  item_title TEXT,
  digital_key TEXT NOT NULL,
  download_url TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  order_id TEXT,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create fulfillment log table
CREATE TABLE public.fulfillment_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_id TEXT NOT NULL,
  listing_id TEXT,
  item_title TEXT,
  buyer_username TEXT,
  buyer_email TEXT,
  digital_key_id UUID REFERENCES public.digital_keys(id),
  message_sent BOOLEAN DEFAULT false,
  invoice_sent BOOLEAN DEFAULT false,
  marked_fulfilled BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.digital_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfillment_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for digital_keys
CREATE POLICY "Users can view their own digital keys" 
ON public.digital_keys FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own digital keys" 
ON public.digital_keys FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own digital keys" 
ON public.digital_keys FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own digital keys" 
ON public.digital_keys FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for fulfillment_log
CREATE POLICY "Users can view their own fulfillment logs" 
ON public.fulfillment_log FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own fulfillment logs" 
ON public.fulfillment_log FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fulfillment logs" 
ON public.fulfillment_log FOR UPDATE USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_digital_keys_user_listing ON public.digital_keys(user_id, listing_id);
CREATE INDEX idx_digital_keys_status ON public.digital_keys(status);
CREATE INDEX idx_fulfillment_log_user ON public.fulfillment_log(user_id);
CREATE INDEX idx_fulfillment_log_order ON public.fulfillment_log(order_id);

-- Trigger for updated_at
CREATE TRIGGER update_digital_keys_updated_at
BEFORE UPDATE ON public.digital_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fulfillment_log_updated_at
BEFORE UPDATE ON public.fulfillment_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();