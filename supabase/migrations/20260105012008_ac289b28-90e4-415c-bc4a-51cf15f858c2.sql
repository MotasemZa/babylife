-- Add unique constraint on (user_id, external_id) for transactions table
-- This enables upsert operations to work correctly
CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_external_unique 
ON public.transactions (user_id, external_id) 
WHERE external_id IS NOT NULL;

-- Add unique constraint on (user_id, external_id) for payouts table
CREATE UNIQUE INDEX IF NOT EXISTS payouts_user_external_unique 
ON public.payouts (user_id, external_id) 
WHERE external_id IS NOT NULL;