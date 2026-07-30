
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS fb_campaign_id text,
  ADD COLUMN IF NOT EXISTS fb_adset_id text,
  ADD COLUMN IF NOT EXISTS fb_ad_id text,
  ADD COLUMN IF NOT EXISTS fb_status text,
  ADD COLUMN IF NOT EXISTS daily_budget numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS targeting jsonb,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

CREATE TABLE IF NOT EXISTS public.facebook_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  access_token text NOT NULL,
  ad_account_id text NOT NULL,
  page_id text,
  page_name text,
  account_name text,
  token_expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.facebook_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own fb accounts" ON public.facebook_ad_accounts
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
