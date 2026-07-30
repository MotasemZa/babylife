
CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  platform text NOT NULL DEFAULT 'google_ads',
  status text NOT NULL DEFAULT 'draft',
  budget numeric DEFAULT 0,
  spent numeric DEFAULT 0,
  clicks integer DEFAULT 0,
  conversions integer DEFAULT 0,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  ad_copy jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own campaigns" ON public.marketing_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own campaigns" ON public.marketing_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own campaigns" ON public.marketing_campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own campaigns" ON public.marketing_campaigns FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.marketing_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  product_ids text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'generating',
  video_url text,
  thumbnail_url text,
  duration_seconds integer DEFAULT 15,
  script jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own videos" ON public.marketing_videos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own videos" ON public.marketing_videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own videos" ON public.marketing_videos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own videos" ON public.marketing_videos FOR DELETE USING (auth.uid() = user_id);
