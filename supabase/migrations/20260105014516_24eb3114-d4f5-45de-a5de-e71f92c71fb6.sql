-- Add unique constraint for (user_id, external_id) on transactions table for upsert support
ALTER TABLE public.transactions 
ADD CONSTRAINT transactions_user_id_external_id_key UNIQUE (user_id, external_id);