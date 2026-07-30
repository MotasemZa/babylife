-- 1. Dedupe duplicate stuck processing rows (keep earliest)
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY order_id, user_id ORDER BY created_at ASC) AS rn
  FROM public.fulfillment_log
  WHERE status = 'processing' AND item_title IS NULL
)
DELETE FROM public.fulfillment_log
WHERE id IN (SELECT id FROM dups WHERE rn > 1);

-- 2. Reset stale processing rows (>5 min old, no title) to skipped so the next cycle re-evaluates them
UPDATE public.fulfillment_log
SET status = 'skipped', error_message = 'Stale claim — reset for re-evaluation'
WHERE status = 'processing'
  AND item_title IS NULL
  AND created_at < now() - interval '5 minutes';

-- 3. Ensure unique index on (order_id, user_id) to prevent future race-condition duplicates
CREATE UNIQUE INDEX IF NOT EXISTS fulfillment_log_order_user_unique
  ON public.fulfillment_log (order_id, user_id);