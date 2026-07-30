-- Add unique constraint for proper upsert on fulfillment_log
ALTER TABLE public.fulfillment_log 
ADD CONSTRAINT fulfillment_log_order_user_unique UNIQUE (order_id, user_id);