-- Add bcc_email and email_footer_html to smtp_settings table
ALTER TABLE smtp_settings 
ADD COLUMN IF NOT EXISTS bcc_email TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS email_footer_html TEXT DEFAULT NULL;