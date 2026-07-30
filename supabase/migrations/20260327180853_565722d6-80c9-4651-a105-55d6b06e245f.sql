
-- Bulk import jobs table
CREATE TABLE public.bulk_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text,
  context text,
  status text NOT NULL DEFAULT 'parsed',
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  search_images boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bulk import jobs" ON public.bulk_import_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own bulk import jobs" ON public.bulk_import_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own bulk import jobs" ON public.bulk_import_jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own bulk import jobs" ON public.bulk_import_jobs FOR DELETE USING (auth.uid() = user_id);

-- Bulk import items table
CREATE TABLE public.bulk_import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.bulk_import_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  group_key text,
  raw_data jsonb,
  title text,
  description text,
  price text,
  tags text,
  product_type text,
  image_urls jsonb DEFAULT '[]'::jsonb,
  image_search_note text,
  status text NOT NULL DEFAULT 'pending',
  published_stores jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_import_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bulk import items" ON public.bulk_import_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own bulk import items" ON public.bulk_import_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own bulk import items" ON public.bulk_import_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own bulk import items" ON public.bulk_import_items FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for items so UI updates live
ALTER PUBLICATION supabase_realtime ADD TABLE public.bulk_import_items;
