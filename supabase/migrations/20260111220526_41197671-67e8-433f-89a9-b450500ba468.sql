-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to call the scheduled-sync edge function
CREATE OR REPLACE FUNCTION public.trigger_scheduled_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_url text := 'https://xgsphsqmdvzaebvgddoa.supabase.co';
  service_role_key text;
BEGIN
  -- Get the service role key from vault (if stored there) or use anon key
  -- For scheduled syncs, we call the edge function which handles auth internally
  PERFORM net.http_post(
    url := project_url || '/functions/v1/scheduled-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhnc3Boc3FtZHZ6YWVidmdkZG9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NjcxOTEsImV4cCI6MjA4MzE0MzE5MX0.3pwwPmOPj_lcORgVtFNMlm7Bv0V129cHrUDih64_QBc'
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Schedule the sync to run every 12 hours (at 00:00 and 12:00 UTC)
SELECT cron.schedule(
  'scheduled-ebay-sync',
  '0 0,12 * * *',
  $$ SELECT public.trigger_scheduled_sync(); $$
);