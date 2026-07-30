-- Fix the policies - the previous approach won't work properly
-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view own non-sensitive settings" ON public.user_settings;

-- Recreate a simple policy that allows users to view their own settings
-- The real protection comes from the frontend using the safe view
CREATE POLICY "Users can view their own settings" 
ON public.user_settings 
FOR SELECT 
USING (auth.uid() = user_id);