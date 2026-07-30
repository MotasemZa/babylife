-- Add columns to store detailed error info for message and invoice failures
ALTER TABLE public.fulfillment_log 
ADD COLUMN IF NOT EXISTS message_error TEXT,
ADD COLUMN IF NOT EXISTS invoice_error TEXT,
ADD COLUMN IF NOT EXISTS message_body TEXT;