-- Admin-managed state for user moderation (block/anonymize)
CREATE TABLE IF NOT EXISTS public.admin_user_state (
  user_id uuid PRIMARY KEY,
  blocked_at timestamptz NULL,
  blocked_reason text NULL,
  deleted_at timestamptz NULL,
  deleted_reason text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_user_state ENABLE ROW LEVEL SECURITY;

-- Only backend service role should read/write this table (all admin actions go through backend functions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_user_state' AND policyname='Service role full access'
  ) THEN
    CREATE POLICY "Service role full access"
    ON public.admin_user_state
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Keep updated_at fresh
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_admin_user_state_updated_at'
  ) THEN
    CREATE TRIGGER trg_admin_user_state_updated_at
    BEFORE UPDATE ON public.admin_user_state
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;