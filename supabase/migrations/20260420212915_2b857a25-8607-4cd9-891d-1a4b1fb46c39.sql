-- Dedupe skipped/null-title fulfillment logs and reset them so the next auto-fulfill cycle re-evaluates them
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY order_id, user_id ORDER BY created_at ASC) AS rn
  FROM public.fulfillment_log
  WHERE status = 'skipped' AND item_title IS NULL
)
DELETE FROM public.fulfillment_log
WHERE id IN (SELECT id FROM dups WHERE rn > 1);

UPDATE public.fulfillment_log
SET status = 'processing', error_message = NULL
WHERE status = 'skipped' AND item_title IS NULL;