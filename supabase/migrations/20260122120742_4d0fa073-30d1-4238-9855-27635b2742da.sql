-- Fix linter: reinstall pg_net extension outside public schema
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    EXECUTE 'DROP EXTENSION pg_net';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
