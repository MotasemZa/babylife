-- Drop the redundant signature column from smtp_settings
-- The email_footer_html column already handles this functionality
ALTER TABLE smtp_settings DROP COLUMN IF EXISTS signature;