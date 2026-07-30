import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ProductOption {
  id: string;
  name: string;
  description: string;
  price: string;
  source: 'inventory' | 'listing';
}

export function useProductList() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['product-options', user?.id],
    queryFn: async (): Promise<ProductOption[]> => {
      if (!user) return [];
      const [invRes, listRes, platRes] = await Promise.all([
        supabase.from('inventory_items').select('id, name, description, sku').eq('user_id', user.id),
        supabase.from('listings').select('id, title, description, price, currency').eq('user_id', user.id),
        supabase.from('platform_listings').select('id, title, price, currency, inventory_item_id').eq('user_id', user.id),
      ]);

      const products: ProductOption[] = [];
      const seen = new Set<string>();

      // Inventory items (get price from linked platform listings)
      for (const item of invRes.data || []) {
        seen.add(item.id);
        const linked = (platRes.data || []).find(p => p.inventory_item_id === item.id);
        products.push({
          id: item.id,
          name: item.name,
          description: item.description || '',
          price: linked?.price ? `${linked.currency || '€'}${linked.price}` : '',
          source: 'inventory',
        });
      }

      // eBay listings not already covered
      for (const l of listRes.data || []) {
        if (!seen.has(l.id)) {
          products.push({
            id: l.id,
            name: l.title,
            description: l.description || '',
            price: l.price ? `${l.currency || '€'}${l.price}` : '',
            source: 'listing',
          });
        }
      }

      return products;
    },
    enabled: !!user,
  });
}
