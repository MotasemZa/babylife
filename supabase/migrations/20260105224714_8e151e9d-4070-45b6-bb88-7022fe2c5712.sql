-- Add AI credits and model preference to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS ai_credits INTEGER NOT NULL DEFAULT 10,
ADD COLUMN IF NOT EXISTS ai_model TEXT NOT NULL DEFAULT 'gpt-4o-mini';

-- Create a table to track credit transactions
CREATE TABLE public.credit_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'usage', 'purchase', 'bonus'
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own credit transactions
CREATE POLICY "Users can view their own credit transactions"
ON public.credit_transactions
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own credit transactions (for usage tracking)
CREATE POLICY "Users can insert their own credit transactions"
ON public.credit_transactions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_credit_transactions_user_id ON public.credit_transactions(user_id);