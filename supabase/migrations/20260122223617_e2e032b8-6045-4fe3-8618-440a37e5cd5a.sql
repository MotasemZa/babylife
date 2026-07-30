ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS invoice_email_subject TEXT,
  ADD COLUMN IF NOT EXISTS invoice_email_body_html TEXT;

UPDATE public.user_settings
SET invoice_email_subject = COALESCE(invoice_email_subject, 'Invoice {INVOICE_NUMBER} from {SELLER_NAME}'),
    invoice_email_body_html = COALESCE(invoice_email_body_html, '<p>Hello {BUYER_NAME},</p><p>Thank you for your purchase. Please find your invoice attached.</p><p>Invoice number: <b>{INVOICE_NUMBER}</b><br/>Total: <b>{TOTAL}</b></p><p>Best regards,<br/>{SELLER_NAME}</p>')
WHERE invoice_email_subject IS NULL OR invoice_email_body_html IS NULL;

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS notify_invoice_failed BOOLEAN NOT NULL DEFAULT true;