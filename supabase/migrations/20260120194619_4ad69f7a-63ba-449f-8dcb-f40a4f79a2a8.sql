-- Add invoice customization fields to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS invoice_logo_url text,
ADD COLUMN IF NOT EXISTS invoice_motto text,
ADD COLUMN IF NOT EXISTS invoice_template text DEFAULT 'modern';