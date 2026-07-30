ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS seller_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS seller_contact_department TEXT,
  ADD COLUMN IF NOT EXISTS seller_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS seller_contact_email TEXT;