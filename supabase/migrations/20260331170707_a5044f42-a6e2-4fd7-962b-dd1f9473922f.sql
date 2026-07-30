ALTER TABLE public.bulk_import_items
ADD COLUMN variant_label text,
ADD COLUMN is_parent boolean DEFAULT false,
ADD COLUMN skip_reason text,
ADD COLUMN ai_group_key text;