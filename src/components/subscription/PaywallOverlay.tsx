import { useState } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, Lock, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const PaywallOverlay = () => {
  const { hasAccess, isLoading, hasChecked, subscription } = useSubscription();
  const { user, loading: authLoading } = useAuth();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleSubscribe = async () => {
    if (!user) {
      toast.error('Please sign in to subscribe');
      return;
    }

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

  // Don't show anything while auth or subscription is still loading
  if (authLoading || isLoading || !hasChecked) {
    return null;
  }

  // User has access (either active subscription or valid trial)
  if (hasAccess) {
    return null;
  }

  // User doesn't have access - show paywall
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg shadow-2xl border-accent/20">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
            <Lock className="h-8 w-8 text-accent" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {subscription?.status === 'trialing' ? 'Trial Expired' : 'Subscription Required'}
          </CardTitle>
          <CardDescription className="text-base">
            {subscription?.status === 'trialing'
              ? 'Your 7-day free trial has ended. Subscribe to continue using inbew Auto Delivery.'
              : 'Subscribe to access all features of inbew Auto Delivery.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">inbew Pro</h3>
              <Badge variant="secondary" className="bg-accent/10 text-accent">
                <Sparkles className="h-3 w-3 mr-1" />
                Most Popular
              </Badge>
            </div>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-4xl font-bold">$9.99</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <ul className="space-y-2">
              {[
                'Automated digital delivery',
                'Automatic invoice sending',
                'Delivery logs & retries',
                'Shopify & marketplace integrations',
                'AI listing tools',
                'Priority support',
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <Button
            onClick={handleSubscribe}
            disabled={isCheckingOut}
            className="w-full h-12 text-base font-semibold"
            size="lg"
          >
            {isCheckingOut ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Redirecting to checkout...
              </>
            ) : (
              'Subscribe Now'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Cancel anytime. Secure payment via Stripe.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
