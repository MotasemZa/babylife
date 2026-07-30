-- Allow admins to view smtp settings for support / setup
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'smtp_settings'
  ) THEN
    EXECUTE 'ALTER TABLE public.smtp_settings ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Admins can view all smtp settings" ON public.smtp_settings';

    EXECUTE 'CREATE POLICY "Admins can view all smtp settings" ON public.smtp_settings FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;
END $$;
