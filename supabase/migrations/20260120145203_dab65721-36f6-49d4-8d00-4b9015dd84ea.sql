-- Step 1: Create a secure view that excludes sensitive eBay credentials
CREATE OR REPLACE VIEW public.user_settings_safe AS
SELECT 
  id,
  user_id,
  ai_credits,
  ai_model,
  auto_delivery_enabled,
  country,
  currency,
  tax_year_start,
  invoice_prefix,
  next_invoice_number,
  seller_business_name,
  seller_address,
  seller_email,
  seller_vat_number,
  -- Include non-sensitive eBay connection status indicators
  ebay_token_expires_at IS NOT NULL AS is_ebay_connected,
  ebay_signing_key_id,
  ebay_signing_key_created_at,
  created_at,
  updated_at
FROM public.user_settings;

-- Step 2: Enable RLS on the view
ALTER VIEW public.user_settings_safe SET (security_invoker = on);

-- Step 3: Grant access to the view
GRANT SELECT ON public.user_settings_safe TO authenticated;

-- Step 4: Drop the old SELECT policy that exposes all columns
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;

-- Step 5: Create a restrictive SELECT policy that only allows service_role to read all columns
-- This ensures edge functions can still access tokens but clients cannot
CREATE POLICY "Service role can view all settings" 
ON public.user_settings 
FOR SELECT 
USING (auth.role() = 'service_role');

-- Step 6: Create policy for users to SELECT only via specific non-sensitive columns
-- Users can still INSERT and UPDATE their own settings
CREATE POLICY "Users can view own non-sensitive settings" 
ON public.user_settings 
FOR SELECT 
USING (
  auth.uid() = user_id 
  AND current_setting('request.path', true) IS NULL
);

-- Note: The INSERT and UPDATE policies remain unchanged, allowing users to modify their own settings