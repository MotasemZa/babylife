-- Deduplicate invoices so we can enforce one invoice per order per user
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, order_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.invoices
)
DELETE FROM public.invoices i
USING ranked r
WHERE i.id = r.id
  AND r.rn > 1;

-- Enforce: one invoice per (user, order)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'invoices_user_order_id_unique'
  ) THEN
    CREATE UNIQUE INDEX invoices_user_order_id_unique
      ON public.invoices (user_id, order_id);
  END IF;
END $$;

-- Helpful lookup index (optional, non-unique)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'invoices_user_transaction_id_idx'
  ) THEN
    CREATE INDEX invoices_user_transaction_id_idx
      ON public.invoices (user_id, transaction_id);
  END IF;
END $$;