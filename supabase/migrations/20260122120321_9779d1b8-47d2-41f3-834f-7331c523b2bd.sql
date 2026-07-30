-- SMTP settings per user
CREATE TABLE IF NOT EXISTS public.smtp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  host text,
  port integer,
  secure boolean NOT NULL DEFAULT false,
  username text,
  password_encrypted text,
  from_email text,
  from_name text,
  reply_to text,
  verified_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.smtp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own smtp settings"
ON public.smtp_settings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own smtp settings"
ON public.smtp_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own smtp settings"
ON public.smtp_settings
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own smtp settings"
ON public.smtp_settings
FOR DELETE
USING (auth.uid() = user_id);

-- Keep updated_at in sync
DROP TRIGGER IF EXISTS update_smtp_settings_updated_at ON public.smtp_settings;
CREATE TRIGGER update_smtp_settings_updated_at
BEFORE UPDATE ON public.smtp_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_smtp_settings_user_id ON public.smtp_settings(user_id);