import { useSubscription } from '@/contexts/SubscriptionContext';
import { Button } from '@/components/ui/button';
import { Clock, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export const TrialBanner = () => {
  const { isTrialing, daysRemaining, hasAccess } = useSubscription();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  if (!hasAccess || !isTrialing) {
    return null;
  }

  const handleSubscribe = async () => {
    setIsCheckingOut(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('create-checkout', {
        body: { origin: window.location.origin },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-accent/10 via-accent/5 to-accent/10 border-b border-accent/20 px-4 py-2">
      <div className="flex items-center justify-center gap-3 text-sm">
        <Clock className="h-4 w-4 text-accent" />
        <span>
          <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong> left in your free trial
        </span>
        <Button
          size="sm"
          variant="default"
          className="h-7 px-3 text-xs gap-1"
          onClick={handleSubscribe}
          disabled={isCheckingOut}
        >
          {isCheckingOut ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Sparkles className="h-3 w-3" />
              Subscribe Now
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
