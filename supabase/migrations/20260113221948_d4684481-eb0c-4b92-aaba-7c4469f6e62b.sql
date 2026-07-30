-- Fix overly permissive UPDATE policy on subscriptions
DROP POLICY IF EXISTS "Service role can update subscriptions" ON public.subscriptions;

CREATE POLICY "Service role can update subscriptions"
ON public.subscriptions
FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');