-- Add unique constraint for platform_listings upsert
ALTER TABLE public.platform_listings 
ADD CONSTRAINT platform_listings_user_platform_listing_unique 
UNIQUE (user_id, platform, platform_listing_id);