-- Add unique constraint on (user_id, external_id) for payouts table to enable upsert
-- This matches the transactions table pattern
ALTER TABLE public.payouts 
ADD CONSTRAINT payouts_user_id_external_id_key UNIQUE (user_id, external_id);