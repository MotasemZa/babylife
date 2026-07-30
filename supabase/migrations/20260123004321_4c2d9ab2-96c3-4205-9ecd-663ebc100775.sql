-- Add structured seller address + invoice designer layout config
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS seller_street text,
ADD COLUMN IF NOT EXISTS seller_city text,
ADD COLUMN IF NOT EXISTS seller_postal_code text,
ADD COLUMN IF NOT EXISTS seller_country text,
ADD COLUMN IF NOT EXISTS invoice_layout jsonb NOT NULL DEFAULT jsonb_build_object(
  'version', 1,
  'sections', jsonb_build_array(
    jsonb_build_object('id','header','enabled',true),
    jsonb_build_object('id','seller','enabled',true),
    jsonb_build_object('id','buyer','enabled',true),
    jsonb_build_object('id','items','enabled',true),
    jsonb_build_object('id','totals','enabled',true),
    jsonb_build_object('id','footer','enabled',true, 'showContact', true)
  )
);

-- Optional: helpful index for JSON queries later (not required but cheap)
CREATE INDEX IF NOT EXISTS idx_user_settings_invoice_layout_gin
ON public.user_settings
USING gin (invoice_layout);