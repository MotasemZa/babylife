-- Update buyer_country from raw_data for existing transactions
-- Extract from shipping address (most accurate for tax purposes)
UPDATE transactions
SET buyer_country = COALESCE(
  -- First try shipping address
  raw_data->'fulfillmentStartInstructions'->0->'shippingStep'->'shipTo'->'contactAddress'->>'countryCode',
  -- Fallback to buyer registration address
  raw_data->'buyer'->'buyerRegistrationAddress'->'contactAddress'->>'countryCode',
  raw_data->'buyer'->'buyerRegistrationAddress'->>'countryCode',
  -- Keep existing if nothing found
  buyer_country
)
WHERE type = 'sale' 
  AND raw_data IS NOT NULL
  AND (
    raw_data->'fulfillmentStartInstructions'->0->'shippingStep'->'shipTo'->'contactAddress'->>'countryCode' IS NOT NULL
    OR raw_data->'buyer'->'buyerRegistrationAddress'->'contactAddress'->>'countryCode' IS NOT NULL
  );