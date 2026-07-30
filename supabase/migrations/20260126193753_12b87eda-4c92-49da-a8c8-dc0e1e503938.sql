-- Add email settings columns to user_settings table
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS auto_send_invoice boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS bcc_email text DEFAULT NULL;