-- Add optional email signature for SMTP/email sending
ALTER TABLE public.smtp_settings
ADD COLUMN IF NOT EXISTS signature text;