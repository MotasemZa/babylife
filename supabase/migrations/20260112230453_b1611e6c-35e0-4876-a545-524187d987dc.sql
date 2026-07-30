-- Add global auto-delivery enabled flag to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS auto_delivery_enabled BOOLEAN NOT NULL DEFAULT true;