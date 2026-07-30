ALTER TABLE marketing_videos 
  ADD COLUMN content_type text NOT NULL DEFAULT 'video_script',
  ADD COLUMN image_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-assets', 'marketing-assets', true);

CREATE POLICY "Users can upload marketing assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'marketing-assets');

CREATE POLICY "Public read access for marketing assets"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'marketing-assets');

CREATE POLICY "Users can delete their marketing assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'marketing-assets');