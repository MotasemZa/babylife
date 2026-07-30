-- Create notification_settings table for Telegram and other notification preferences
CREATE TABLE public.notification_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  telegram_chat_id text,
  telegram_enabled boolean NOT NULL DEFAULT false,
  notify_fulfillment_success boolean NOT NULL DEFAULT true,
  notify_fulfillment_failed boolean NOT NULL DEFAULT true,
  notify_out_of_stock boolean NOT NULL DEFAULT true,
  notify_daily_summary boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own notification settings"
ON public.notification_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notification settings"
ON public.notification_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification settings"
ON public.notification_settings FOR UPDATE
USING (auth.uid() = user_id);

-- Service role access for edge functions
CREATE POLICY "Service role can view all notification settings"
ON public.notification_settings FOR SELECT
USING (auth.role() = 'service_role');

-- Create trigger for updated_at
CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();