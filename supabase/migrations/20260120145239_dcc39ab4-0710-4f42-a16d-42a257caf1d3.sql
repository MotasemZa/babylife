-- Create a secure table for eBay credentials that is ONLY accessible via service_role
CREATE TABLE public.user_ebay_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  ebay_access_token text,
  ebay_refresh_token text,
  ebay_token_expires_at timestamp with time zone,
  ebay_signing_key_jwe text,
  ebay_signing_private_key text,
  ebay_signing_key_id text,
  ebay_signing_key_created_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_ebay_credentials ENABLE ROW LEVEL SECURITY;

-- ONLY service_role can access this table - no client access at all
CREATE POLICY "Service role full access" 
ON public.user_ebay_credentials 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create trigger for updated_at
CREATE TRIGGER update_user_ebay_credentials_updated_at
  BEFORE UPDATE ON public.user_ebay_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing credentials from user_settings to new secure table
INSERT INTO public.user_ebay_credentials (
  user_id,
  ebay_access_token,
  ebay_refresh_token,
  ebay_token_expires_at,
  ebay_signing_key_jwe,
  ebay_signing_private_key,
  ebay_signing_key_id,
  ebay_signing_key_created_at,
  created_at,
  updated_at
)
SELECT 
  user_id,
  ebay_access_token,
  ebay_refresh_token,
  ebay_token_expires_at,
  ebay_signing_key_jwe,
  ebay_signing_private_key,
  ebay_signing_key_id,
  ebay_signing_key_created_at,
  created_at,
  updated_at
FROM public.user_settings
WHERE ebay_refresh_token IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  ebay_access_token = EXCLUDED.ebay_access_token,
  ebay_refresh_token = EXCLUDED.ebay_refresh_token,
  ebay_token_expires_at = EXCLUDED.ebay_token_expires_at,
  ebay_signing_key_jwe = EXCLUDED.ebay_signing_key_jwe,
  ebay_signing_private_key = EXCLUDED.ebay_signing_private_key,
  ebay_signing_key_id = EXCLUDED.ebay_signing_key_id,
  ebay_signing_key_created_at = EXCLUDED.ebay_signing_key_created_at,
  updated_at = EXCLUDED.updated_at;

-- Add a is_ebay_connected computed column indicator to user_settings view
-- Update the safe view to include connection status
DROP VIEW IF EXISTS public.user_settings_safe;
CREATE VIEW public.user_settings_safe AS
SELECT 
  us.id,
  us.user_id,
  us.ai_credits,
  us.ai_model,
  us.auto_delivery_enabled,
  us.country,
  us.currency,
  us.tax_year_start,
  us.invoice_prefix,
  us.next_invoice_number,
  us.seller_business_name,
  us.seller_address,
  us.seller_email,
  us.seller_vat_number,
  us.created_at,
  us.updated_at,
  -- Include connection status from secure table (using EXISTS subquery)
  EXISTS (
    SELECT 1 FROM public.user_ebay_credentials uec 
    WHERE uec.user_id = us.user_id 
    AND uec.ebay_refresh_token IS NOT NULL
  ) AS is_ebay_connected,
  -- Include non-sensitive signing key metadata
  uec.ebay_signing_key_id,
  uec.ebay_signing_key_created_at
FROM public.user_settings us
LEFT JOIN public.user_ebay_credentials uec ON uec.user_id = us.user_id;

-- Enable RLS on view
ALTER VIEW public.user_settings_safe SET (security_invoker = on);
GRANT SELECT ON public.user_settings_safe TO authenticated;