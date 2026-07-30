-- Add columns for eBay Digital Signature keys (for EU/UK sellers)
ALTER TABLE public.user_settings
ADD COLUMN ebay_signing_key_jwe TEXT,
ADD COLUMN ebay_signing_private_key TEXT,
ADD COLUMN ebay_signing_key_id TEXT,
ADD COLUMN ebay_signing_key_created_at TIMESTAMP WITH TIME ZONE;